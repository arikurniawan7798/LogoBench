import sharp from "sharp";
import { HttpError } from "../errors.js";
import { HEX_RE } from "../colors/convert.js";

export const MIN_DIM = 16;
export const MAX_DIM = 8192;
export const MAX_PIXELS = 33_000_000;
const LOGO_SHARE = 0.4;

export type BackgroundOpts = { width: number; height: number; color: string; logo?: { bytes: Buffer; mime: string } };

export async function makeBackground(opts: BackgroundOpts): Promise<Buffer> {
  const { width, height, color, logo } = opts;
  const okDim = (n: unknown) => Number.isInteger(n) && (n as number) >= MIN_DIM && (n as number) <= MAX_DIM;
  if (!okDim(width) || !okDim(height)) throw new HttpError(422, `width and height must be whole numbers from ${MIN_DIM} to ${MAX_DIM}`);
  if (width * height > MAX_PIXELS) throw new HttpError(422, "Image too large; width x height must be at most 33 megapixels");
  if (typeof color !== "string" || !HEX_RE.test(color)) throw new HttpError(422, "color must be #RRGGBB");
  const rgb = { r: parseInt(color.slice(1, 3), 16), g: parseInt(color.slice(3, 5), 16), b: parseInt(color.slice(5, 7), 16) };
  try {
    let img = sharp({ create: { width, height, channels: 3, background: rgb } });
    if (logo) {
      const box = Math.max(1, Math.floor(Math.min(width, height) * LOGO_SHARE));
      const mark = await sharp(logo.bytes, { density: logo.mime === "image/svg+xml" ? 384 : undefined, limitInputPixels: 50_000_000 })
        .resize({ width: box, height: box, fit: "inside" })
        .png()
        .toBuffer();
      img = img.composite([{ input: mark, gravity: "centre" }]);
    }
    return await img.png().toBuffer();
  } catch {
    throw new HttpError(422, "Could not process image");
  }
}
