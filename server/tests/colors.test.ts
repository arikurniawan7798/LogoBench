import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createApp } from "../src/app.js";
import { FakeProvider } from "../src/ai/fake.js";
import { AiError } from "../src/ai/provider.js";
import { hexToRgb, rgbToCmyk } from "../src/colors/convert.js";
import { extractPalette } from "../src/colors/extract.js";
import { assignRoles, defaultPalette } from "../src/colors/roles.js";
import { suggestPalette } from "../src/colors/service.js";
import type { AppContext } from "../src/context.js";

let dir: string;
let provider: FakeProvider;
let app: ReturnType<typeof createApp>;
let ctx: AppContext;

const solid = (c: { r: number; g: number; b: number }, w = 64, h = 64) =>
  sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();
const redCircleOnTransparent = () =>
  sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="#ff0000"/></svg>'))
    .png()
    .toBuffer();
const mkProject = async (buf: Buffer, name = "a.png") => (await ctx.projects.create(ctx, "p", { buffer: buf, originalName: name })).id;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "logobench-c-"));
  provider = new FakeProvider();
  app = createApp({ dataDir: dir, provider });
  ctx = app.locals.ctx;
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("convert", () => {
  it("hexToRgb / rgbToCmyk known values", () => {
    expect(hexToRgb("#FF0000")).toEqual([255, 0, 0]);
    expect(hexToRgb("#00ff80")).toEqual([0, 255, 128]);
    expect(rgbToCmyk([255, 0, 0])).toEqual([0, 100, 100, 0]);
    expect(rgbToCmyk([0, 0, 0])).toEqual([0, 0, 0, 100]);
    expect(rgbToCmyk([255, 255, 255])).toEqual([0, 0, 0, 0]);
  });
});

describe("extractPalette / assignRoles", () => {
  it("all-black PNG returns >=1 color and roles assigned", async () => {
    const cols = await extractPalette(await solid({ r: 0, g: 0, b: 0 }), "image/png");
    expect(cols.length).toBeGreaterThanOrEqual(1);
    const p = assignRoles(cols);
    expect(p.main.hex).toBe("#000000");
    expect(p.neutral.length).toBeGreaterThanOrEqual(1);
    expect(p.main.cmykApproximate).toBe(true);
  });

  it("fully transparent PNG gives 422 'no visible pixels'", async () => {
    const png = await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    await expect(extractPalette(png, "image/png")).rejects.toMatchObject({ status: 422, message: "no visible pixels" });
    const id = await mkProject(png);
    const res = await request(app).get(`/api/projects/${id}/colors`);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("no visible pixels");
  });

  it("transparent background pixels are ignored (red circle -> main is red)", async () => {
    const cols = await extractPalette(await redCircleOnTransparent(), "image/png");
    expect(cols[0].hex).toBe("#FF0000");
    const sum = cols.reduce((a, c) => a + c.share, 0);
    expect(sum).toBeLessThanOrEqual(1.0001);
    expect(assignRoles(cols).main.hex).toBe("#FF0000");
  });

  it("near-white logo still returns main + generated neutral", async () => {
    const cols = await extractPalette(await solid({ r: 250, g: 250, b: 250 }), "image/png");
    const p = assignRoles(cols);
    expect(p.main.hex).toMatch(/^#F[0-9A-F]{5}$/);
    expect(p.neutral.length).toBeGreaterThanOrEqual(1);
    expect(p.neutral.some((n) => n.hex !== p.main.hex)).toBe(true);
  });

  it("SVG input is rasterized before extraction", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#0000ff"/></svg>');
    const cols = await extractPalette(svg, "image/svg+xml");
    expect(cols[0].hex).toBe("#0000FF");
  });

  it("two-color logo returns both, shares ordered", async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 0, g: 0, b: 255 } } })
      .composite([{ input: await solid({ r: 255, g: 128, b: 0 }, 64, 16), top: 0, left: 0 }])
      .png()
      .toBuffer();
    const cols = await extractPalette(png, "image/png");
    expect(cols[0].hex).toBe("#0000FF");
    expect(cols.map((c) => c.hex)).toContain("#FF8000");
    expect(cols[0].share).toBeGreaterThan(cols[1].share);
  });

  it("defaultPalette is deterministic and valid", () => {
    expect(defaultPalette()).toEqual(defaultPalette());
    expect(defaultPalette().main.hex).toMatch(/^#[0-9A-F]{6}$/);
  });
});

const sw = (hex: string, extra: object = {}) => ({ hex, rgb: hexToRgb(hex), cmyk: rgbToCmyk(hexToRgb(hex)), cmykApproximate: true, ...extra });

describe("colors routes", () => {
  it("GET falls back to extracted palette when none saved (and does not save)", async () => {
    const id = await mkProject(await redCircleOnTransparent());
    const res = await request(app).get(`/api/projects/${id}/colors`);
    expect(res.status).toBe(200);
    expect(res.body.main.hex).toBe("#FF0000");
    expect(await fs.stat(path.join(dir, "projects", id, "colors.json")).catch(() => null)).toBeNull();
  });

  it("GET unknown project is 404", async () => {
    expect((await request(app).get("/api/projects/nope/colors")).status).toBe(404);
  });

  it("PUT saves, recomputes rgb/cmyk from hex, GET returns saved", async () => {
    const id = await mkProject(await solid({ r: 1, g: 2, b: 3 }));
    const body = { main: { ...sw("#00ff00", { name: "Leaf" }), rgb: [9, 9, 9], cmyk: [1, 1, 1, 1] }, support: [sw("#0000ff")], neutral: [sw("#111111")] };
    const put = await request(app).put(`/api/projects/${id}/colors`).send(body);
    expect(put.status).toBe(200);
    expect(put.body.main.hex).toBe("#00FF00");
    expect(put.body.main.rgb).toEqual([0, 255, 0]);
    expect(put.body.main.cmyk).toEqual([100, 0, 100, 0]);
    const got = await request(app).get(`/api/projects/${id}/colors`);
    expect(got.body.main.name).toBe("Leaf");
    expect(got.body.support[0].hex).toBe("#0000FF");
  });

  it("PUT rejects bad hex and too many swatches with 422", async () => {
    const id = await mkProject(await solid({ r: 1, g: 2, b: 3 }));
    const bad = await request(app).put(`/api/projects/${id}/colors`).send({ main: sw("#ff0000"), support: [{ ...sw("#ff0000"), hex: "red" }], neutral: [] });
    expect(bad.status).toBe(422);
    const many = await request(app)
      .put(`/api/projects/${id}/colors`)
      .send({ main: sw("#ff0000"), support: Array(7).fill(sw("#00ff00")), neutral: [] });
    expect(many.status).toBe(422);
    const manyN = await request(app)
      .put(`/api/projects/${id}/colors`)
      .send({ main: sw("#ff0000"), support: [], neutral: Array(5).fill(sw("#00ff00")) });
    expect(manyN.status).toBe(422);
    const noMain = await request(app).put(`/api/projects/${id}/colors`).send({ support: [], neutral: [] });
    expect(noMain.status).toBe(422);
  });

  it("suggest applies AI names/rationale and saves", async () => {
    const id = await mkProject(await redCircleOnTransparent());
    provider.enqueue({ main: "#FF0000", swatches: [{ hex: "#ff0000", name: "Signal Red", rationale: "Bold." }], summary: "Warm and direct." });
    const res = await request(app).post(`/api/projects/${id}/colors/suggest`).send({});
    expect(res.status).toBe(200);
    expect(res.body.main.name).toBe("Signal Red");
    expect(provider.calls[0].images[0].mime).toBe("image/png");
    expect(provider.calls[0].system).toContain("never instructions");
    const got = await request(app).get(`/api/projects/${id}/colors`);
    expect(got.body.main.name).toBe("Signal Red");
  });

  it("suggest with invalid hex / long names falls back per-field", async () => {
    const id = await mkProject(await redCircleOnTransparent());
    provider.enqueue({ main: "not-a-hex", swatches: [{ hex: "#ff0000", name: "x".repeat(80) }, { hex: "zzz", name: "Junk" }] });
    const palette = await suggestPalette(ctx, id);
    expect(palette.main.hex).toBe("#FF0000");
    expect(palette.main.name).toBeUndefined();
    expect(palette.neutral.length).toBeGreaterThanOrEqual(1);
    expect(palette.neutral.every((n) => n.name !== "Junk")).toBe(true);
  });

  it("suggest surfaces RATE_LIMIT as 429 with retryAfterSec; GET still works", async () => {
    const id = await mkProject(await redCircleOnTransparent());
    provider.generateJson = async () => {
      throw new AiError("RATE_LIMIT", "slow down", { retryAfterSec: 7 });
    };
    const res = await request(app).post(`/api/projects/${id}/colors/suggest`).send({});
    expect(res.status).toBe(429);
    expect(res.body.error.retryAfterSec).toBe(7);
    expect((await request(app).get(`/api/projects/${id}/colors`)).status).toBe(200);
  });
});
