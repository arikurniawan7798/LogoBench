import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { request } from "./helpers/request.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { createApp } from "../src/app.js";
import { recolorSvg, monochromeSvg } from "../src/export/recolor.js";
import { buildExportZip } from "../src/export/package.js";
import { makeFavicons } from "../src/export/favicon.js";
import { makeBackground } from "../src/export/background.js";
import type { AppContext } from "../src/context.js";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="50" height="50" fill="#FF0000"/><circle cx="70" cy="70" r="20" style="fill:#f00;stroke:#00ff00"/><path d="M0 0h10" fill="#123456"/></svg>`;
const GRAD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/><circle r="2" fill="#ff0000"/></svg>`;
const wellFormed = (s: string) => new XMLParser({ ignoreAttributes: false }).parse(s, true) !== undefined;

let dir: string;
let app: ReturnType<typeof createApp>;
let ctx: AppContext;
let png: Buffer;
const mk = async (name: string, buf: Buffer, file = "a.svg") => (await ctx.projects.create(ctx, name, { buffer: buf, originalName: file })).id;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "logobench-x-"));
  app = createApp({ hostCheck: false, dataDir: dir });
  ctx = app.locals.ctx;
  png = await sharp({ create: { width: 40, height: 20, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("recolorSvg", () => {
  it("swaps simple fills (attribute and style, 3/6-digit, any case) and keeps others", () => {
    const r = recolorSvg(SVG, { "#ff0000": "#0000FF" });
    expect(r.warnings).toEqual([]);
    expect(r.svg).toContain('fill="#0000ff"');
    expect(r.svg).toContain("fill:#0000ff");
    expect(r.svg).not.toMatch(/#ff0000/i);
    expect(r.svg).toContain("stroke:#00ff00");
    expect(r.svg).toContain('fill="#123456"');
    expect(wellFormed(r.svg)).toBe(true);
  });
  it("swaps named colors", () => {
    expect(recolorSvg(`<svg xmlns="http://www.w3.org/2000/svg"><rect fill="red"/></svg>`, { "#ff0000": "#00ff00" }).svg).toContain('fill="#00ff00"');
  });
  it("gradient SVG yields a warning and an unchanged gradient", () => {
    const r = recolorSvg(GRAD, { "#ff0000": "#00ff00" });
    expect(r.warnings.join(" ")).toMatch(/gradient/i);
    expect(r.svg).toContain('stop-color="#ff0000"');
    expect(r.svg).toContain('fill="url(#g)"');
    expect(r.svg).toContain('<circle r="2" fill="#00ff00"');
    expect(wellFormed(r.svg)).toBe(true);
  });
  it("warns on <image>", () => {
    expect(recolorSvg(`<svg xmlns="http://www.w3.org/2000/svg"><image href="#x"/></svg>`, {}).warnings.join(" ")).toMatch(/image/i);
  });
  it("rejects non-hex map keys/values with 422 (no injection)", () => {
    for (const map of [{ "#ff0000": 'red" onload="x' }, { red: "#000000" }, { "#ff0000": "#fff" }] as Record<string, string>[]) {
      expect(() => recolorSvg(SVG, map)).toThrowError(expect.objectContaining({ status: 422 }));
    }
  });
});

describe("recolorSvg edge cases and monochrome variants", () => {
  const NS = 'xmlns="http://www.w3.org/2000/svg"';
  it("recolors !important declarations in a <style> block and preserves !important", () => {
    const r = recolorSvg(`<svg ${NS}><style>.a{fill:#fff !important;stroke: #000000!important}</style><rect class="a" fill="#fff"/></svg>`, { "#ffffff": "#112233", "#000000": "#445566" });
    expect(r.svg).toContain("fill:#112233 !important");
    expect(r.svg).toContain("stroke: #445566 !important");
    expect(r.warnings).toEqual([]);
  });
  it("swaps simultaneously (A->B and B->A)", () => {
    const r = recolorSvg(`<svg ${NS}><rect fill="#ff0000"/><rect fill="#0000ff"/></svg>`, { "#ff0000": "#0000ff", "#0000ff": "#ff0000" });
    expect(r.svg).toContain('<rect fill="#0000ff"/><rect fill="#ff0000"/>');
  });
  it("warns on unsupported rgb()/hsl() values and leaves them unchanged", () => {
    const r = recolorSvg(`<svg ${NS}><rect fill="rgb(255,0,0)"/><circle style="stroke:hsl(10,50%,50%)"/></svg>`, {});
    expect(r.warnings.filter((w) => /Unsupported color value/.test(w))).toHaveLength(2);
    expect(r.svg).toContain("rgb(255,0,0)");
  });
  it("monochrome replaces currentColor (attribute and style) but keeps fill=none", () => {
    const r = monochromeSvg(`<svg ${NS}><path fill="currentColor" stroke="none"/><path style="fill:currentColor"/><path fill="none"/></svg>`, "#ffffff");
    expect(r.svg).not.toMatch(/currentColor/i);
    expect(r.svg).toContain('fill="#ffffff"');
    expect(r.svg).toContain("fill:#ffffff");
    expect(r.svg).toContain('stroke="none"');
    expect(r.svg).toContain('fill="none"');
  });
  it("shapes with no fill attribute render black / white in the monochrome variants", async () => {
    const src = `<svg ${NS} viewBox="0 0 10 10" width="10" height="10"><path d="M0 0h10v10H0z"/></svg>`;
    const px = async (svg: string) => [...(await sharp(Buffer.from(svg)).flatten({ background: "#808080" }).raw().toBuffer()).subarray(5 * 10 * 3 + 15, 5 * 10 * 3 + 18)];
    expect(await px(monochromeSvg(src, "#000000").svg)).toEqual([0, 0, 0]);
    expect(await px(monochromeSvg(src, "#ffffff").svg)).toEqual([255, 255, 255]);
  });
});

describe("buildExportZip", () => {
  it("SVG project contains the expected fixed names", async () => {
    const id = await mk("Secret Name", Buffer.from(SVG));
    const { zip, skipped } = await buildExportZip(ctx, id, {});
    const files = Object.keys(unzipSync(new Uint8Array(zip)));
    for (const n of ["logo.svg", "logo-main.svg", "logo-white.svg", "logo-black.svg", "logo-on-dark.svg", "logo-on-light.svg", "png/logo-main-256.png", "png/logo-white-1024.png", "jpg/logo-on-light.jpg", "favicons/favicon.ico", "favicons/apple-touch-icon.png", "README.txt"])
      expect(files).toContain(n);
    expect(skipped).toEqual([]);
    for (const f of files) {
      expect(f).toMatch(/^[A-Za-z0-9._\-/]+$/);
      expect(f).not.toContain("..");
      expect(f.startsWith("/")).toBe(false);
      expect(f.toLowerCase()).not.toContain("secret");
    }
    const white = Buffer.from(unzipSync(new Uint8Array(zip))["logo-white.svg"]).toString();
    expect(white).toContain("#ffffff");
    expect(wellFormed(white)).toBe(true);
  });
  it("PNG project has no SVG files and skipped explains the need for an SVG source", async () => {
    const id = await mk("P", png, "a.png");
    const { zip, skipped } = await buildExportZip(ctx, id, {});
    const entries = unzipSync(new Uint8Array(zip));
    const files = Object.keys(entries);
    expect(files.some((f) => f.endsWith(".svg"))).toBe(false);
    expect(files).toContain("png/logo-main-512.png");
    expect(files).toContain("jpg/logo-on-light.jpg");
    expect(skipped).toContain("logo.svg: needs an SVG source");
    expect(skipped.every((s) => s.endsWith("needs an SVG source"))).toBe(true);
    expect(skipped.some((s) => s.startsWith("logo-white.svg"))).toBe(true);
    expect(Buffer.from(entries["README.txt"]).toString()).toContain("needs an SVG source");
  });
  it("surfaces recolor warnings in README.txt but not in skipped", async () => {
    const id = await mk("W", Buffer.from(GRAD.replace("</svg>", '<rect fill="rgb(1,2,3)"/></svg>')));
    const { zip, skipped } = await buildExportZip(ctx, id, {});
    const readme = Buffer.from(unzipSync(new Uint8Array(zip))["README.txt"]).toString();
    expect(readme).toMatch(/Gradients are not recolored/);
    expect(readme).toMatch(/Unsupported color value "rgb\(1,2,3\)"/);
    expect(skipped).toEqual([]);
  });
  it("unknown project is 404", async () => {
    expect((await request(app).get("/api/projects/nope/export.zip")).status).toBe(404);
    await expect(buildExportZip(ctx, "nope", {})).rejects.toThrow();
  });
  it("route serves a zip with a safe disposition and X-Export-Skipped", async () => {
    const id = await mk("Ünï name", png, "a.png");
    const res = await request(app).get(`/api/projects/${id}/export.zip`).buffer(true).parse((r, cb) => {
      const c: Buffer[] = [];
      r.on("data", (d: Buffer) => c.push(d));
      r.on("end", () => cb(null, Buffer.concat(c)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/zip/);
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
    expect(res.headers["x-export-skipped"]).toContain("needs an SVG source");
    expect(Object.keys(unzipSync(new Uint8Array(res.body)))).toContain("README.txt");
  });
});

describe("makeFavicons", () => {
  it("includes all six PNG sizes plus a valid multi-size ico, keeping aspect and transparency", async () => {
    const out = await makeFavicons(png, "image/png");
    expect(out.map((o) => o.name)).toEqual(["favicon-16x16.png", "favicon-32x32.png", "favicon-48x48.png", "apple-touch-icon.png", "android-chrome-192x192.png", "android-chrome-512x512.png", "favicon.ico"]);
    const sizes = [16, 32, 48, 180, 192, 512];
    for (let i = 0; i < 6; i++) {
      const m = await sharp(out[i].bytes).metadata();
      expect([m.width, m.height, m.format]).toEqual([sizes[i], sizes[i], "png"]);
    }
    // 40x20 source: top-left corner is transparent padding, centre is the (semi-transparent) red logo
    const raw = await sharp(out[1].bytes).raw().toBuffer();
    expect(raw[3]).toBe(0);
    expect(raw[(16 * 32 + 16) * 4 + 3]).toBeGreaterThan(0);
    const ico = out[6].bytes;
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 3]);
    for (let i = 0; i < 3; i++) {
      const o = 6 + 16 * i;
      const size = [16, 32, 48][i];
      expect([ico[o], ico[o + 1], ico.readUInt16LE(o + 4), ico.readUInt16LE(o + 6)]).toEqual([size, size, 1, 32]);
      const len = ico.readUInt32LE(o + 8);
      const off = ico.readUInt32LE(o + 12);
      const m = await sharp(ico.subarray(off, off + len)).metadata();
      expect([m.width, m.height]).toEqual([size, size]);
    }
  });
  it("works for SVG input", async () => {
    const out = await makeFavicons(Buffer.from(SVG), "image/svg+xml");
    expect((await sharp(out[3].bytes).metadata()).width).toBe(180);
  });
});

describe("makeBackground", () => {
  it("output has the requested dimensions and colour, logo centred", async () => {
    const b = await makeBackground({ width: 200, height: 100, color: "#112233" });
    const m = await sharp(b).metadata();
    expect([m.width, m.height]).toEqual([200, 100]);
    expect([...(await sharp(b).raw().toBuffer()).subarray(0, 3)]).toEqual([0x11, 0x22, 0x33]);
    const withLogo = await makeBackground({ width: 200, height: 100, color: "#000000", logo: { bytes: png, mime: "image/png" } });
    const raw = await sharp(withLogo).removeAlpha().raw().toBuffer();
    expect(raw[0]).toBe(0);
    expect(raw[(50 * 200 + 100) * 3]).toBeGreaterThan(0);
  });
  it("rejects bad dimensions or colour with 422", async () => {
    const bad = [{ width: 9000, height: 100, color: "#000000" }, { width: 8192, height: 8192, color: "#000000" }, { width: 5, height: 100, color: "#000000" }, { width: 10.5, height: 100, color: "#000000" }, { width: 100, height: 100, color: "red" }];
    for (const o of bad) await expect(makeBackground(o)).rejects.toMatchObject({ status: 422 });
  });
});

describe("tools routes", () => {
  it("favicons returns a zip", async () => {
    const res = await request(app).post("/api/tools/favicons").attach("logo", png, "a.png").buffer(true).parse((r, cb) => {
      const c: Buffer[] = [];
      r.on("data", (d: Buffer) => c.push(d));
      r.on("end", () => cb(null, Buffer.concat(c)));
    });
    expect(res.status).toBe(200);
    expect(Object.keys(unzipSync(new Uint8Array(res.body)))).toContain("favicon.ico");
  });
  it("background returns a png; bad size 422", async () => {
    const ok = await request(app).post("/api/tools/background").field("width", "64").field("height", "32").field("color", "#ff0000").attach("logo", png, "a.png");
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toMatch(/image\/png/);
    expect((await sharp(ok.body).metadata()).width).toBe(64);
    const bad = await request(app).post("/api/tools/background").field("width", "99999").field("height", "32").field("color", "#ff0000");
    expect(bad.status).toBe(422);
  });
  it("reject non-images with 415 and oversized with 413", async () => {
    const small = createApp({ hostCheck: false, dataDir: dir, limits: { uploadBytes: 2048 } });
    for (const url of ["/api/tools/favicons", "/api/tools/background"]) {
      const q = () => request(small).post(url).field("width", "64").field("height", "64").field("color", "#000000");
      expect((await q().attach("logo", Buffer.from("GIF89a....."), "a.gif")).status).toBe(415);
      expect((await q().attach("logo", Buffer.from("hello"), "a.png")).status).toBe(415);
      expect((await q().attach("logo", Buffer.alloc(4096), "a.png")).status).toBe(413);
    }
  });
});
