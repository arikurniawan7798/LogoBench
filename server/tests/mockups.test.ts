import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { request } from "./helpers/request.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createApp } from "../src/app.js";
import type { AppContext } from "../src/context.js";
import { MOCKUP_KINDS, MOCKUP_SPECS, buildMockupSvg, prepareScene, renderMockup, type MockupKind } from "../src/mockups/render.js";
import { fitBox } from "../src/mockups/templates/common.js";
import { defaultPalette, makeSwatch } from "../src/colors/roles.js";
import { defaultTypeSystem } from "../src/type/pairings.js";
import { renderProjectMockups } from "../src/identity/bundle.js";
import { getPalette } from "../src/colors/service.js";
import { hexToRgb } from "../src/colors/convert.js";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#FF0000"/></svg>`;
const EVIL = `"><script>alert(1)</script> & 'x'`;

let dir: string;
let app: ReturnType<typeof createApp>;
let ctx: AppContext;
let png: Buffer;
const solid = (w: number, h: number, c = { r: 255, g: 0, b: 0 }) =>
  sharp({ create: { width: w, height: h, channels: 3, background: c } });
const base = (over: Record<string, unknown> = {}) => ({
  logo: { mime: "image/png", bytes: png },
  palette: defaultPalette(),
  type: defaultTypeSystem(),
  brandName: "Acme",
  ...over,
});
const pixel = async (buf: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 3;
  return [data[i], data[i + 1], data[i + 2]];
};

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "logobench-m-"));
  app = createApp({ hostCheck: false, dataDir: dir });
  ctx = app.locals.ctx;
  png = await solid(200, 100).png().toBuffer();
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("renderMockup", () => {
  it.each(MOCKUP_KINDS)("%s renders a PNG with the expected dimensions", async (kind) => {
    const out = await renderMockup(kind, base());
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("png");
    expect([meta.width, meta.height]).toEqual([MOCKUP_SPECS[kind].width, MOCKUP_SPECS[kind].height]);
  });

  it("documents exact output sizes", () => {
    expect(MOCKUP_SPECS.website).toMatchObject({ width: 1280, height: 720 });
    expect(MOCKUP_SPECS.mobile).toMatchObject({ width: 780, height: 1688 });
    expect(MOCKUP_SPECS.appicon).toMatchObject({ width: 512, height: 512 });
    expect(MOCKUP_SPECS.favicon).toMatchObject({ width: 600, height: 240 });
    expect(MOCKUP_SPECS.businesscard).toMatchObject({ width: 1050, height: 600 });
  });

  it("escapes a hostile brand name: no raw script in the template, rendering succeeds", async () => {
    for (const kind of MOCKUP_KINDS) {
      const svg = buildMockupSvg(kind, await prepareScene(base({ brandName: EVIL })));
      expect(svg).not.toContain("<script");
      expect(svg).not.toContain("alert(1)</");
      if (kind !== "appicon") {
        // brand name is shown (clipped) in every template except the app icon
        const shown = buildMockupSvg(kind, await prepareScene(base({ brandName: `<&"'>` })));
        expect(shown).toContain("&lt;&amp;&quot;&apos;&gt;");
      }
      const out = await renderMockup(kind, base({ brandName: EVIL }));
      expect((await sharp(out).metadata()).width).toBe(MOCKUP_SPECS[kind].width);
    }
  });

  it("handles RTL, emoji, control characters and very long names without crashing", async () => {
    for (const name of ["شركة العلامة 🚀", "Acme\u0000\u0007 ‮gnirts", "x".repeat(5000), "", "   "]) {
      const out = await renderMockup("businesscard", base({ brandName: name }));
      expect((await sharp(out).metadata()).width).toBe(1050);
    }
    const scene = await prepareScene(base({ brandName: "a\u0000b" + "z".repeat(200) }));
    expect(scene.name.length).toBeLessThanOrEqual(60);
    expect(scene.name).not.toMatch(/[\u0000-\u001f]/);
  });

  it("works with default palette and type system", async () => {
    const out = await renderMockup("website", base({ palette: defaultPalette(), type: defaultTypeSystem() }));
    expect((await sharp(out).metadata()).width).toBe(1280);
  });

  it.each([
    ["png", "image/png", () => png],
    ["svg", "image/svg+xml", () => Buffer.from(SVG)],
    ["webp", "image/webp", () => solid(80, 60).webp().toBuffer()],
  ])("%s logo input renders", async (_n, mime, get) => {
    const bytes = await get();
    for (const kind of MOCKUP_KINDS) {
      const out = await renderMockup(kind, base({ logo: { mime, bytes } }));
      expect((await sharp(out).metadata()).width).toBe(MOCKUP_SPECS[kind].width);
    }
  });

  it("never embeds user SVG markup: an SVG logo with a script becomes a raster data URI", async () => {
    const evil = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10"/></svg>`);
    const scene = await prepareScene(base({ logo: { mime: "image/svg+xml", bytes: evil } }));
    expect(scene.logo.uri.startsWith("data:image/png;base64,")).toBe(true);
    expect(buildMockupSvg("website", scene)).not.toContain("<script");
  });

  it("falls back to a safe font for non-curated or malicious font names", async () => {
    const type = { ...defaultTypeSystem(), heading: `Evil" onload="x`, body: "Not A Real Font" };
    const scene = await prepareScene(base({ type }));
    for (const kind of MOCKUP_KINDS) {
      const svg = buildMockupSvg(kind, scene);
      expect(svg).not.toContain("onload");
      expect(svg).not.toContain("Not A Real Font");
    }
    const out = await renderMockup("website", base({ type }));
    expect((await sharp(out).metadata()).width).toBe(1280);
  });

  it("maps curated font categories to generic families", async () => {
    const mono = await prepareScene(base({ type: { ...defaultTypeSystem(), heading: "JetBrains Mono" } }));
    expect(mono.headFamily).toBe("monospace");
    const serif = await prepareScene(base({ type: { ...defaultTypeSystem(), heading: "Playfair Display" } }));
    expect(serif.headFamily).toBe("serif");
  });

  it("invalid palette hex falls back per color to the default (no throw, no injection)", async () => {
    const p = defaultPalette();
    const bad = { ...p, main: { ...p.main, hex: `red" onload="x` }, support: [{ ...makeSwatch("#00AA00"), hex: "#GGGGGG" }] };
    const scene = await prepareScene(base({ palette: bad }));
    expect(scene.main).toBe(defaultPalette().main.hex);
    for (const kind of MOCKUP_KINDS) expect(buildMockupSvg(kind, scene)).not.toContain("onload");
    const out = await renderMockup("mobile", base({ palette: bad }));
    expect((await sharp(out).metadata()).width).toBe(780);
  });

  it("fitBox contain-fits wide and tall logos without stretching", () => {
    const wide = fitBox(1000, 10, 100, 100);
    expect(wide.w).toBe(100);
    expect(wide.w / wide.h).toBeCloseTo(100, 5);
    const tall = fitBox(10, 1000, 100, 100);
    expect(tall.h).toBe(100);
    expect(tall.w / tall.h).toBeCloseTo(0.01, 5);
    expect(fitBox(0, 0, 50, 50)).toEqual({ w: 50, h: 50 });
  });

  it("extreme aspect ratios render", async () => {
    const wide = await solid(2000, 20).png().toBuffer();
    const tall = await solid(20, 2000).png().toBuffer();
    for (const bytes of [wide, tall]) {
      const out = await renderMockup("appicon", base({ logo: { mime: "image/png", bytes } }));
      expect((await sharp(out).metadata()).width).toBe(512);
    }
  });

  it("app icon: tile corners are the tile color, logo is centered and <= 60% of the tile", async () => {
    const pal = { ...defaultPalette(), main: makeSwatch("#0000FF") };
    const logo = await solid(100, 100, { r: 255, g: 255, b: 0 }).png().toBuffer();
    const out = await renderMockup("appicon", base({ palette: pal, logo: { mime: "image/png", bytes: logo } }));
    const { width, height } = MOCKUP_SPECS.appicon;
    expect([width, height]).toEqual([512, 512]);
    expect(await pixel(out, 256, 256)).toEqual([255, 255, 0]);
    // just inside the rounded corners of the tile
    for (const [x, y] of [[100, 100], [412, 100], [100, 412], [412, 412]]) expect(await pixel(out, x, y)).toEqual([0, 0, 255]);
    // logo box is at most 60% of the 384px tile (230px): points beyond it are tile color
    expect(await pixel(out, 256 + 120, 256)).toEqual([0, 0, 255]);
    expect(await pixel(out, 256, 256 - 120)).toEqual([0, 0, 255]);
  });
});

describe("mockup routes", () => {
  const mk = async (name = "Acme") =>
    (await ctx.projects.create(ctx, name, { buffer: png, originalName: "a.png" })).id;

  it("404 for unknown kind, with a clear message", async () => {
    const id = await mk();
    for (const k of ["nope", "..%2Fetc", "WEBSITE", "website.jpg"]) {
      const r = await request(app).get(`/api/projects/${id}/mockups/${k}.png`);
      expect(r.status).toBe(404);
      expect(r.body.error).toMatch(/mockup/i);
    }
  });

  it("404 for unknown project", async () => {
    const r = await request(app).get("/api/projects/does-not-exist/mockups/website.png");
    expect(r.status).toBe(404);
  });

  it.each(MOCKUP_KINDS)("200 image/png for %s using defaults", async (kind: MockupKind) => {
    const id = await mk();
    const r = await request(app).get(`/api/projects/${id}/mockups/${kind}.png`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("image/png");
    expect(r.headers["cache-control"]).toBe("no-store");
    const meta = await sharp(r.body as Buffer).metadata();
    expect([meta.width, meta.height]).toEqual([MOCKUP_SPECS[kind].width, MOCKUP_SPECS[kind].height]);
  });

  it("uses the saved palette and a hostile project name safely", async () => {
    const id = await mk(EVIL);
    const pal = { ...defaultPalette(), main: makeSwatch("#00FF00") };
    await ctx.store.writeJson(`projects/${id}/colors.json`, pal);
    const r = await request(app).get(`/api/projects/${id}/mockups/appicon.png`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect(await pixel(r.body as Buffer, 100, 100)).toEqual([0, 255, 0]);
  });

  it("with no saved palette uses the logo's extracted colors, same as the identity bundle", async () => {
    const id = await mk("Acme");
    const r = await request(app).get(`/api/projects/${id}/mockups/appicon.png`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    const fromRoute = await pixel(r.body as Buffer, 100, 100);
    const bundled = (await renderProjectMockups(ctx, id)).find((m) => m.kind === "appicon")!.png;
    expect(fromRoute).toEqual(await pixel(bundled, 100, 100));
    expect(fromRoute).toEqual(hexToRgb((await getPalette(ctx, id)).main.hex));
    expect(fromRoute).not.toEqual(hexToRgb(defaultPalette().main.hex));
  });

  it("lists kinds and dimensions", async () => {
    const r = await request(app).get("/api/mockups");
    expect(r.status).toBe(200);
    expect(r.body.map((k: { kind: string }) => k.kind)).toEqual([...MOCKUP_KINDS]);
  });
});
