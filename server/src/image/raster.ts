import sharp from "sharp";
import { HttpError } from "../errors.js";

const DEFAULT_MAX = 1024;
const MAX_INPUT_PIXELS = 50_000_000;

/** Normalize any supported logo (SVG/PNG/JPG/WebP) to a PNG that fits inside maxSize x maxSize. Failures become a fixed-message 422. */
export async function rasterizeToPng(bytes: Buffer, mime: string, opts: { maxSize?: number } = {}): Promise<Buffer> {
  const max = Math.max(1, Math.min(opts.maxSize ?? DEFAULT_MAX, 4096));
  try {
    return await sharp(bytes, { density: mime === "image/svg+xml" ? 192 : undefined, limitInputPixels: MAX_INPUT_PIXELS })
      .resize({ width: max, height: max, fit: "inside", withoutEnlargement: mime !== "image/svg+xml" })
      .png()
      .toBuffer();
  } catch {
    throw new HttpError(422, "Could not process image");
  }
}
