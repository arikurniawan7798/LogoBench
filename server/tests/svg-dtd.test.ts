import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { request } from "./helpers/request.js";
import { createApp } from "../src/app.js";
import { FakeProvider } from "../src/ai/fake.js";
import { sniffMime } from "../src/projects.js";
import { sanitizeSvg, SvgDtdError } from "../src/svg.js";
import { rasterizeToPng } from "../src/image/raster.js";

// Illustrator "Save As > SVG" writes a DOCTYPE whose internal subset declares namespace URIs as entities
// (<!ENTITY ns_svg "http://www.w3.org/2000/svg">) and then uses xmlns="&ns_svg;".
const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "fixtures", name));
const ILLUSTRATOR = fixture("illustrator-saveas.svg");
const LAUGHS = fixture("hostile-billion-laughs.svg");
const XXE = fixture("hostile-external-entity.svg");

const dims = ["readability", "originality", "balance", "scalability", "misinterpretation"];
const good = () => ({
  scores: Object.fromEntries(dims.map((d) => [d, { score: 7, reason: `${d} reason.` }])),
  personality: { presence: "calm", attitude: "friendly", formality: "casual", style: "geometric", tone: "warm", positioning: "mid-market" },
  summary: "Looks solid.",
});

async function centerPixel(png: Buffer): Promise<number[]> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const i = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

describe("sniffMime with a DOCTYPE internal subset / long prolog", () => {
  it("recognizes an Illustrator Save-As SVG (entities containing '>')", () => {
    expect(sniffMime(ILLUSTRATOR)).toBe("image/svg+xml");
  });

  it("recognizes an SVG behind a 3 KB leading comment", () => {
    const svg = Buffer.from(`<?xml version="1.0"?>\n<!-- ${"x".repeat(3000)} -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>`);
    expect(sniffMime(svg)).toBe("image/svg+xml");
  });

  it("still rejects non-SVG XML and HTML", () => {
    expect(sniffMime(Buffer.from(`<?xml version="1.0"?><!DOCTYPE html [<!ENTITY a "<svg>">]><html><svg></svg></html>`))).toBeNull();
    expect(sniffMime(Buffer.from(`<!-- <svg> --><html/>`))).toBeNull();
  });
});

describe("sanitizeSvg DTD handling", () => {
  it("expands the simple string entities so namespaces resolve, and drops the DOCTYPE", () => {
    const out = sanitizeSvg(ILLUSTRATOR.toString("utf8"));
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    expect(out).not.toMatch(/&ns_/);
    expect(out).not.toMatch(/DOCTYPE|ENTITY/);
    expect(out).toContain("<rect");
  });

  it("refuses a billion-laughs DTD (entities referencing entities) with a re-export hint", () => {
    expect(() => sanitizeSvg(LAUGHS.toString("utf8"))).toThrow(SvgDtdError);
    expect(() => sanitizeSvg(LAUGHS.toString("utf8"))).toThrow(/File > Export > SVG/);
  });

  it("refuses external and parameter entities (never resolved or fetched)", () => {
    expect(() => sanitizeSvg(XXE.toString("utf8"))).toThrow(SvgDtdError);
  });

  it("refuses too many or too long entity declarations", () => {
    const many = Array.from({ length: 65 }, (_, i) => `<!ENTITY e${i} "v">`).join("");
    expect(() => sanitizeSvg(`<!DOCTYPE svg [${many}]><svg xmlns="http://www.w3.org/2000/svg"/>`)).toThrow(SvgDtdError);
    const long = `<!ENTITY big "${"a".repeat(3000)}">`;
    expect(() => sanitizeSvg(`<!DOCTYPE svg [${long}]><svg xmlns="http://www.w3.org/2000/svg">&big;</svg>`)).toThrow(SvgDtdError);
  });

  it("caps total expansion size (many references to one entity)", () => {
    const refs = "&e;".repeat(2000);
    const doc = `<!DOCTYPE svg [<!ENTITY e "${"a".repeat(1000)}">]><svg xmlns="http://www.w3.org/2000/svg"><text>${refs}</text></svg>`;
    expect(() => sanitizeSvg(doc)).toThrow(SvgDtdError);
  });

  it("escapes quotes in expanded values so attributes stay well-formed", () => {
    const out = sanitizeSvg(`<!DOCTYPE svg [<!ENTITY t 'a"b'>]><svg xmlns="http://www.w3.org/2000/svg"><rect id="&t;"/></svg>`);
    expect(out).toContain('id="a&quot;b"');
  });
});

describe("Illustrator SVG end to end", () => {
  let dir: string;
  let provider: FakeProvider;
  let app: ReturnType<typeof createApp>;
  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), "logobench-dtd-"));
    provider = new FakeProvider();
    app = createApp({ hostCheck: false, dataDir: dir, provider });
  });
  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it("uploads, stores a clean SVG, rasterizes and reaches the reviewer as the red square", async () => {
    const up = await request(app).post("/api/projects").field("name", "ai").attach("logo", ILLUSTRATOR, "logo.svg");
    expect(up.status).toBe(201);
    const v = up.body.versions[0];
    expect(v.mime).toBe("image/svg+xml");
    const stored = await fsp.readFile(path.join(dir, "projects", up.body.id, v.file));
    expect(stored.toString("utf8")).toContain('xmlns="http://www.w3.org/2000/svg"');
    const png = await rasterizeToPng(stored, "image/svg+xml", { maxSize: 64 });
    const [r, g, b] = await centerPixel(png);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(100);
    expect(b).toBeLessThan(100);

    provider.enqueue(good());
    const rev = await request(app).post(`/api/projects/${up.body.id}/review`).send({});
    expect(rev.status).toBe(200);
    const sent = provider.calls[0].images[0];
    expect(sent.mime).toBe("image/png");
    expect((await centerPixel(Buffer.from(sent.bytes)))[0]).toBeGreaterThan(200);
  });

  it("hostile DTD uploads are refused with 415 and the re-export hint; nothing is stored", async () => {
    for (const bytes of [LAUGHS, XXE]) {
      const res = await request(app).post("/api/projects").field("name", "x").attach("logo", bytes, "evil.svg");
      expect(res.status).toBe(415);
      expect(res.body.error).toMatch(/File > Export > SVG/);
    }
    expect(fs.existsSync(path.join(dir, "projects")) ? fs.readdirSync(path.join(dir, "projects")) : []).toEqual([]);
  });
});
