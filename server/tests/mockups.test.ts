import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { request } from "./helpers/request.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createApp } from "../src/app.js";
import type { AppContext } from "../src/context.js";
import { MOCKUP_KINDS, MOCKUP_SPECS, buildMockupSvg, prepareScene, renderMockup, type MockupKind } from "../src/mockups/render.js";
import { estimateTextWidth, fitBox, fitText, wrapText } from "../src/mockups/templates/common.js";
import { WEBSITE_HERO_ART_X } from "../src/mockups/templates/website.svg.js";
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
    expect(Array.from(scene.name).length).toBeLessThanOrEqual(80);
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

describe("text layout helpers", () => {
  it("wrapText keeps every line within the width and ellipsizes only the last allowed line", () => {
    const name = "Gemini Generated Image h0v3jyh0v3jyh0v3";
    const lines = wrapText(`Welcome to ${name}`, 600, 52, 3);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length).toBeLessThanOrEqual(3);
    for (const l of lines) expect(estimateTextWidth(l, 52)).toBeLessThanOrEqual(600);
    expect(lines.join(" ")).toBe(`Welcome to ${name}`); // fits in 3 lines: nothing dropped
    const tight = wrapText("x".repeat(300), 200, 20, 2);
    expect(tight).toHaveLength(2);
    expect(tight[1].endsWith("…")).toBe(true);
    for (const l of tight) expect(estimateTextWidth(l, 20)).toBeLessThanOrEqual(200);
    expect(wrapText("Short", 600, 52, 3)).toEqual(["Short"]);
  });

  it("fitText ellipsizes a single line to the width", () => {
    const one = fitText("Gemini Generated Image h0v3jyh0v3jyh0v3", 180, 13);
    expect(one.endsWith("…")).toBe(true);
    expect(estimateTextWidth(one, 13)).toBeLessThanOrEqual(180);
    expect(fitText("Acme", 180, 13)).toBe("Acme");
  });
});

describe("long names", () => {
  const LONG = "Gemini Generated Image h0v3jyh0v3jyh0v3";

  it.each(MOCKUP_KINDS)("%s keeps its exact dimensions with a long name", async (kind) => {
    const out = await renderMockup(kind, base({ brandName: LONG }));
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([MOCKUP_SPECS[kind].width, MOCKUP_SPECS[kind].height]);
  });

  it("website heading wraps onto several lines inside the text column (no overlap with the hero art)", async () => {
    const svg = buildMockupSvg("website", await prepareScene(base({ brandName: LONG })));
    const heading = [...svg.matchAll(/<text x="([\d.]+)"[^>]*font-size="(\d+)"[^>]*data-role="hero-title"[^>]*>([^<]*)<\/text>/g)];
    expect(heading.length).toBeGreaterThan(1);
    expect(heading.map((m) => m[3]).join(" ")).toBe(`Welcome to ${LONG}`);
    for (const m of heading) expect(Number(m[1]) + estimateTextWidth(m[3], Number(m[2]))).toBeLessThan(WEBSITE_HERO_ART_X - 20);
  });

  it("mobile heading wraps to at most two lines before an ellipsis", async () => {
    const svg = buildMockupSvg("mobile", await prepareScene(base({ brandName: LONG })));
    const lines = [...svg.matchAll(/data-role="hero-title"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    expect(lines).toHaveLength(2);
    expect(lines.join(" ")).toContain("Gemini");
  });

  it("business card name wraps instead of overflowing the card", async () => {
    const svg = buildMockupSvg("businesscard", await prepareScene(base({ brandName: LONG + " Holdings International" })));
    const lines = [...svg.matchAll(/<text x="([\d.]+)"[^>]*font-size="(\d+)"[^>]*data-role="brand"[^>]*>([^<]*)<\/text>/g)];
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const m of lines) expect(Number(m[1]) + estimateTextWidth(m[3], Number(m[2]))).toBeLessThanOrEqual(950);
  });
});

describe("app icon logo background", () => {
  /** A JPEG-like raster: white (slightly noisy) background with a dark wordmark-ish bar and a white detail inside it. */
  const jpegLike = async () => {
    const w = 400;
    const h = 200;
    const data = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        const notch = x >= 140 && x < 160 && y < 110; // background reaching into the mark from the top
        const inMark = x >= 80 && x < 320 && y >= 70 && y < 130 && !notch;
        const inHole = x >= 190 && x < 210 && y >= 90 && y < 110; // white enclosed by the mark: must stay white
        const noise = (x * 7 + y * 13) % 5; // deterministic "compression" noise
        const v = inMark && !inHole ? [20 + noise, 40, 90] : [252 - noise, 253 - noise, 251];
        data.set(v, i);
      }
    return sharp(data, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
  };
  const close = (a: number[], b: number[], tol = 30) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

  it("knocks out a uniform light background: the tile color shows through, the mark and enclosed white survive", async () => {
    const pal = { ...defaultPalette(), main: makeSwatch("#00AA55") };
    const bytes = await jpegLike();
    const scene = await prepareScene(base({ palette: pal, logo: { mime: "image/jpeg", bytes } }));
    expect(scene.logoMode).toBe("knockout");
    // the prepared logo is transparent at its corners and trimmed to the mark
    const logoPng = Buffer.from(scene.logo.uri.split(",")[1], "base64");
    const { data, info } = await sharp(logoPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.width / info.height).toBeCloseTo(240 / 60, 0);
    expect(data[3]).toBeLessThan(40); // top-left alpha
    const out = await renderMockup("appicon", base({ palette: pal, logo: { mime: "image/jpeg", bytes } }));
    const green = [0, 170, 85];
    // inside the tile but outside the mark: tile color, not white
    // (198,235) is inside the logo's bounds, in the notch: only a real knockout makes it tile-colored
    for (const [x, y] of [[198, 235], [256, 200], [256, 320], [100, 256]]) expect(close(await pixel(out, x, y), green), `${x},${y}`).toBe(true);
    // the mark is preserved (dark), and the enclosed white detail stays white
    const mark = await pixel(out, 180, 256);
    expect(mark[0] + mark[1] + mark[2]).toBeLessThan(250);
    const hole = await pixel(out, 256, 256);
    expect(Math.min(...hole)).toBeGreaterThan(200);
  });

  it("a knocked-out mark that is mostly the tile color goes on a white badge instead of vanishing into the tile", async () => {
    const pal = { ...defaultPalette(), main: makeSwatch("#145ACA") };
    const w = 300;
    const h = 150;
    const data = Buffer.alloc(w * h * 3, 255);
    for (let y = 50; y < 100; y++) for (let x = 60; x < 240; x++) data.set([20, 90, 202], (y * w + x) * 3);
    const bytes = await sharp(data, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    const scene = await prepareScene(base({ palette: pal, logo: { mime: "image/jpeg", bytes } }));
    expect(scene.logoMode).toBe("knockout");
    expect(scene.iconBadge).toBe(true);
    expect(buildMockupSvg("appicon", scene)).toContain('data-role="badge"');
    // a contrasting tile keeps the mark directly on the tile
    const green = await prepareScene(base({ palette: { ...defaultPalette(), main: makeSwatch("#00AA55") }, logo: { mime: "image/jpeg", bytes } }));
    expect(green.iconBadge).toBe(false);
    expect(buildMockupSvg("appicon", green)).not.toContain('data-role="badge"');
  });

  it("is deterministic", async () => {
    const bytes = await jpegLike();
    const a = await renderMockup("appicon", base({ logo: { mime: "image/jpeg", bytes } }));
    const b = await renderMockup("appicon", base({ logo: { mime: "image/jpeg", bytes } }));
    expect(a.equals(b)).toBe(true);
  });

  it("falls back to a white rounded badge for a photo-like logo with no uniform background", async () => {
    const w = 200;
    const h = 200;
    const data = Buffer.alloc(w * h * 3);
    for (let i = 0; i < w * h; i++) data.set([(i * 37) % 256, (i * 91) % 256, (i * 53) % 256], i * 3);
    const bytes = await sharp(data, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
    const pal = { ...defaultPalette(), main: makeSwatch("#0000FF") };
    const scene = await prepareScene(base({ palette: pal, logo: { mime: "image/jpeg", bytes } }));
    expect(scene.logoMode).toBe("badge");
    expect(scene.iconBadge).toBe(true);
    const svg = buildMockupSvg("appicon", scene);
    expect(svg).toContain('data-role="badge"');
    const out = await renderMockup("appicon", base({ palette: pal, logo: { mime: "image/jpeg", bytes } }));
    // the badge's padding ring is white, between the tile and the photo
    expect(await pixel(out, 256, 256 - 108)).toEqual([255, 255, 255]);
    expect(await pixel(out, 100, 100)).toEqual([0, 0, 255]);
  });

  it("falls back to the badge when the mark covers almost the whole image", async () => {
    const w = 200;
    const h = 200;
    const data = Buffer.alloc(w * h * 3, 255);
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) data.set([30, 30, 30], (y * w + x) * 3);
    const bytes = await sharp(data, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
    expect((await prepareScene(base({ logo: { mime: "image/png", bytes } }))).logoMode).toBe("badge");
  });

  it("leaves SVG logos and already-transparent rasters alone", async () => {
    expect((await prepareScene(base({ logo: { mime: "image/svg+xml", bytes: Buffer.from(SVG) } }))).logoMode).toBe("asis");
    const transparent = await sharp({ create: { width: 100, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await solid(40, 20).png().toBuffer(), left: 30, top: 15 }])
      .png()
      .toBuffer();
    expect((await prepareScene(base({ logo: { mime: "image/png", bytes: transparent } }))).logoMode).toBe("asis");
  });
});
