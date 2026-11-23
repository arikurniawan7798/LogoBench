import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { request } from "./helpers/request.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Response } from "supertest";
import { z } from "zod";
import { unzipSync, strFromU8 } from "fflate";
import { createApp } from "../src/app.js";
import { FakeProvider } from "../src/ai/fake.js";
import type { FontFetcher } from "../src/identity/fonts.js";

/**
 * End-to-end smoke over the real HTTP stack (IPC socket, no network): upload -> review -> colors -> type
 * -> mockups -> export.zip -> identity.zip, with a FakeProvider and a fake Google Fonts fetcher.
 */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#E63946"/><rect x="40" y="40" width="20" height="20" fill="#1D3557"/></svg>`;
const WOFF2 = Buffer.concat([Buffer.from("wOF2", "latin1"), Buffer.alloc(60, 1)]);
const dim = { score: 8, reason: "ok" };
const REVIEW = {
  scores: { readability: dim, originality: dim, balance: dim, scalability: dim, misinterpretation: dim },
  personality: { presence: "bold", attitude: "friendly", formality: "casual", style: "modern", tone: "warm", positioning: "mid" },
  summary: "Solid mark.",
};
const COLORS = { main: "#E63946", swatches: [{ hex: "#E63946", name: "Signal Red" }, { hex: "#1D3557", name: "Deep Navy" }], summary: "Warm." };
const TYPE = { heading: "Playfair Display", body: "Inter" };

const fonts: FontFetcher = async (url) => {
  const u = new URL(url);
  if (u.hostname === "fonts.googleapis.com") {
    const family = (u.searchParams.get("family") ?? "").split(":")[0];
    const slug = family.toLowerCase().replace(/ /g, "");
    const faces = [400, 700]
      .map((w) => `/* latin */\n@font-face {\n  font-family: '${family}';\n  font-style: normal;\n  font-weight: ${w};\n  src: url(https://fonts.gstatic.com/s/${slug}/v1/lat-${w}.woff2) format('woff2');\n  unicode-range: U+0000-00FF;\n}`)
      .join("\n");
    return new Response(faces, { status: 200, headers: { "content-type": "text/css" } });
  }
  if (u.hostname === "fonts.gstatic.com") return new Response(new Uint8Array(WOFF2), { status: 200 });
  return new Response("nope", { status: 404 });
};

const binary = (r: Response, cb: (e: Error | null, b: Buffer) => void) => {
  const c: Buffer[] = [];
  r.on("data", (d: Buffer) => c.push(d));
  r.on("end", () => cb(null, Buffer.concat(c)));
};

let dir: string;
let app: ReturnType<typeof createApp>;
let provider: FakeProvider;
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "logobench-smoke-"));
  provider = new FakeProvider([REVIEW, COLORS, TYPE]);
  app = createApp({ dataDir: dir, provider, fontFetcher: fonts });
});
afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("smoke: whole flow", () => {
  it("upload -> review -> colors -> type -> mockups -> export.zip -> identity.zip", async () => {
    const up = await request(app).post("/api/projects").field("name", "Smoke Co").attach("logo", Buffer.from(SVG), "logo.svg");
    expect(up.status).toBe(201);
    const id = up.body.id as string;

    const review = await request(app).post(`/api/projects/${id}/review`).send({});
    expect(review.status).toBe(200);
    expect(review.headers["content-type"]).toMatch(/json/);
    expect(review.body.result.summary).toBe("Solid mark.");
    expect(review.body.result.scores.readability.score).toBe(8);
    const stored = await request(app).get(`/api/projects/${id}/review`);
    expect(stored.body.result.summary).toBe("Solid mark.");

    const colors = await request(app).post(`/api/projects/${id}/colors/suggest`).send({});
    expect(colors.status).toBe(200);
    expect(JSON.stringify(colors.body)).toContain("Signal Red");
    expect(JSON.stringify(colors.body)).toContain("#E63946");

    const type = await request(app).post(`/api/projects/${id}/type/suggest`).send({});
    expect(type.status).toBe(200);
    expect(type.body.typeSystem.heading).toBe("Playfair Display");
    expect(type.body.typeSystem.body).toBe("Inter");
    expect(provider.callCount).toBe(3);

    const mock = await request(app).get(`/api/projects/${id}/mockups/website.png`).buffer(true).parse(binary);
    expect(mock.status).toBe(200);
    expect(mock.headers["content-type"]).toBe("image/png");
    expect((mock.body as Buffer).subarray(1, 4).toString()).toBe("PNG");

    const exp = await request(app).get(`/api/projects/${id}/export.zip`).buffer(true).parse(binary);
    expect(exp.status).toBe(200);
    expect(exp.headers["content-type"]).toMatch(/application\/zip/);
    expect(Object.keys(unzipSync(new Uint8Array(exp.body as Buffer)))).toContain("README.txt");

    const ident = await request(app).get(`/api/projects/${id}/identity.zip`).buffer(true).parse(binary);
    expect(ident.status).toBe(200);
    expect(ident.headers["content-type"]).toBe("application/zip");
    const files = unzipSync(new Uint8Array(ident.body as Buffer));
    expect(Object.keys(files)).toContain("index.html");
    expect(Object.keys(files)).toContain("assets/logo.svg");
    const html = strFromU8(files["index.html"]);
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).toContain("#E63946");
    expect(html).toContain("#1D3557");
    expect(html).toContain("Signal Red");
    expect(html).toContain("Playfair Display");
    expect(provider.callCount).toBe(3); // queue fully consumed in order; identity.zip made no extra AI call
    await expect(provider.generateJson({ system: "", prompt: "", images: [], schema: z.any() })).rejects.toThrow(/no queued response/);
  });
});
