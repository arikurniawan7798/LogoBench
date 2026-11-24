import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { request } from "./helpers/request.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { unzipSync, strFromU8 } from "fflate";
import { createApp } from "../src/app.js";
import type { AppContext } from "../src/context.js";
import { defaultNameFromFile, PROJECT_NAME_MAX } from "../src/projects.js";
import { renderMockup } from "../src/mockups/render.js";
import { getRenderPalette } from "../src/colors/service.js";
import { getType } from "../src/type/pairings.js";
import { buildIdentityZip } from "../src/identity/bundle.js";
import type { FontFetcher } from "../src/identity/fonts.js";

const offlineFonts: FontFetcher = async () => {
  throw new TypeError("fetch failed");
};

let dir: string;
let app: ReturnType<typeof createApp>;
let ctx: AppContext;
let png: Buffer;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "logobench-r-"));
  app = createApp({ hostCheck: false, dataDir: dir, fontFetcher: offlineFonts });
  ctx = app.locals.ctx;
  png = await sharp({ create: { width: 120, height: 60, channels: 3, background: { r: 20, g: 90, b: 200 } } }).png().toBuffer();
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

describe("defaultNameFromFile", () => {
  it.each([
    ["ledgerly-logo.jpg", "ledgerly logo"],
    ["Gemini_Generated_Image_h0v3jyh0v3jyh0v3.jpg", "Gemini Generated Image h0v3jyh0v3jyh0v3"],
    ["acme.co.final.v2.png", "acme co final v2"],
    ["  spaced -- out__name .svg", "spaced out name"],
    ["noext", "noext"],
    [".svg", "Untitled logo"],
    ["", "Untitled logo"],
    ["---.png", "Untitled logo"],
  ])("%j -> %j", (input, expected) => {
    expect(defaultNameFromFile(input)).toBe(expected);
  });

  it("caps at 80 characters and strips control characters", () => {
    const long = defaultNameFromFile(`${"a".repeat(200)}.png`);
    expect(Array.from(long)).toHaveLength(PROJECT_NAME_MAX);
    expect(PROJECT_NAME_MAX).toBe(80);
    expect(defaultNameFromFile("a\u0000b\u0007c.png")).toBe("a b c");
  });
});

describe("POST /api/projects default name", () => {
  it("derives a friendly name from the file name when no name is given", async () => {
    const res = await request(app).post("/api/projects").attach("logo", png, "ledgerly-logo.png");
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("ledgerly logo");
    expect(res.body.versions[0].originalName).toBe("ledgerly-logo.png");
  });

  it("keeps an explicitly supplied name as-is", async () => {
    const res = await request(app).post("/api/projects").field("name", "Ledgerly_Inc.").attach("logo", png, "x.png");
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Ledgerly_Inc.");
  });
});

describe("PATCH /api/projects/:id", () => {
  const mk = async (name = "old.png") => (await ctx.projects.create(ctx, name, { buffer: png, originalName: "old.png" })).id;

  it("renames (trimmed), returns the project and persists it", async () => {
    const id = await mk();
    const res = await request(app).patch(`/api/projects/${id}`).send({ name: "  Ledgerly  " });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, name: "Ledgerly" });
    expect(res.body.versions).toHaveLength(1);
    const again = await request(app).get(`/api/projects/${id}`);
    expect(again.body.name).toBe("Ledgerly");
    const onDisk = JSON.parse(await fs.readFile(path.join(dir, "projects", id, "project.json"), "utf8"));
    expect(onDisk.name).toBe("Ledgerly");
    const list = await request(app).get("/api/projects");
    expect(list.body.map((p: { name: string }) => p.name)).toEqual(["Ledgerly"]);
  });

  it("accepts exactly 80 characters (counted by code point)", async () => {
    const id = await mk();
    const name = "é".repeat(79) + "🚀";
    const res = await request(app).patch(`/api/projects/${id}`).send({ name });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(name);
  });

  it("404 for an unknown project", async () => {
    const res = await request(app).patch("/api/projects/does-not-exist").send({ name: "X" });
    expect(res.status).toBe(404);
  });

  it.each([
    ["empty", { name: "" }],
    ["whitespace only", { name: "   " }],
    ["81 characters", { name: "x".repeat(81) }],
    ["a control character", { name: "Acme\u0007Co" }],
    ["a newline", { name: "Acme\nCo" }],
    ["a bidi override", { name: "Acme‮oC" }],
    ["a number", { name: 42 }],
    ["missing", {}],
  ])("400 for %s, and the name is unchanged", async (_label, body) => {
    const id = await mk();
    const res = await request(app).patch(`/api/projects/${id}`).send(body);
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error).toMatch(/name/i);
    expect((await ctx.projects.get(ctx, id)).name).toBe("old.png");
  });

  it("is guarded by the Host/Origin check like every other route", async () => {
    const guarded = createApp({ dataDir: dir, hostCheck: { port: 3001 } });
    const id = await mk();
    const res = await request(guarded)
      .patch(`/api/projects/${id}`)
      .set("Host", "127.0.0.1:3001")
      .set("Origin", "http://evil.example")
      .send({ name: "Pwned" });
    expect(res.status).toBe(403);
    expect((await ctx.projects.get(ctx, id)).name).toBe("old.png");
  });

  it("a rename racing a new version upload loses neither", async () => {
    const id = await mk();
    await Promise.all([
      request(app).patch(`/api/projects/${id}`).send({ name: "Renamed" }),
      request(app).post(`/api/projects/${id}/versions`).attach("logo", png, "v2.png"),
    ]);
    const p = await ctx.projects.get(ctx, id);
    expect(p.name).toBe("Renamed");
    expect(p.versions).toHaveLength(2);
  });

  it("mockups, the identity zip and download names use the new name", async () => {
    const id = await mk("ledgerly-logo.jpg");
    const get = (kind: string) => request(app).get(`/api/projects/${id}/mockups/${kind}.png`).buffer(true).parse(binary);
    const before = await get("businesscard");
    expect(before.status).toBe(200);

    expect((await request(app).patch(`/api/projects/${id}`).send({ name: "Ledgerly" })).status).toBe(200);

    const after = await get("businesscard");
    const expected = await renderMockup("businesscard", {
      logo: { mime: "image/png", bytes: (await ctx.projects.latestVersion(ctx, id)).bytes },
      palette: await getRenderPalette(ctx, id),
      type: await getType(ctx, id),
      brandName: "Ledgerly",
    });
    const raw = (b: Buffer) => sharp(b).raw().toBuffer();
    expect((await raw(after.body as Buffer)).equals(await raw(expected))).toBe(true);
    expect((await raw(after.body as Buffer)).equals(await raw(before.body as Buffer))).toBe(false);

    const { zip } = await buildIdentityZip(ctx, id);
    const html = strFromU8(unzipSync(new Uint8Array(zip))["index.html"]);
    expect(html).toContain("<h1>Ledgerly</h1>");
    expect(html).not.toContain("ledgerly-logo.jpg");

    const res = await request(app).get(`/api/projects/${id}/identity.zip`).buffer(true).parse(binary);
    expect(res.headers["content-disposition"]).toContain('filename="Ledgerly-identity.zip"');
    const pack = await request(app).get(`/api/projects/${id}/export.zip`).buffer(true).parse(binary);
    if (pack.status === 200) expect(pack.headers["content-disposition"]).toContain("Ledgerly");
  });
});
