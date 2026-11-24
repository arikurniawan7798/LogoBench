import { describe, it, expect } from "vitest";
import express from "express";
import { request } from "./helpers/request.js";
import sharp from "sharp";
import { rasterizeToPng } from "../src/image/raster.js";
import { HttpError, errorHandler } from "../src/errors.js";

const SVG = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4" fill="#00f"/></svg>`);

describe("rasterizeToPng", () => {
  it("SVG becomes PNG within maxSize", async () => {
    const out = await rasterizeToPng(SVG, "image/svg+xml", { maxSize: 64 });
    const m = await sharp(out).metadata();
    expect(m.format).toBe("png");
    expect(Math.max(m.width!, m.height!)).toBeLessThanOrEqual(64);
  });
  it("large raster is shrunk to fit default bounds", async () => {
    const big = await sharp({ create: { width: 3000, height: 100, channels: 3, background: "#fff" } }).png().toBuffer();
    const m = await sharp(await rasterizeToPng(big, "image/png")).metadata();
    expect(m.width).toBeLessThanOrEqual(1024);
  });
  it("garbage maps to HttpError 422 with fixed message", async () => {
    const err: any = await rasterizeToPng(Buffer.from("<svg nope"), "image/svg+xml").catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(422);
    expect(err.message).toBe("Could not process image");
  });
});

describe("errorHandler HttpError", () => {
  it("honors status and message", async () => {
    const app = express();
    app.get("/x", (_q, _r, next) => next(new HttpError(422, "nope")));
    app.use(errorHandler);
    const res = await request(app).get("/x");
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("nope");
  });
});
