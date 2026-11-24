import sharp from "sharp";
import { HttpError } from "../errors.js";

export const FAVICON_FILES = [
  { name: "favicon-16x16.png", size: 16 },
  { name: "favicon-32x32.png", size: 32 },
  { name: "favicon-48x48.png", size: 48 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "android-chrome-192x192.png", size: 192 },
  { name: "android-chrome-512x512.png", size: 512 },
] as const;
const ICO_SIZES = [16, 32, 48];
const MAX_INPUT_PIXELS = 50_000_000;

/** Square, contain-fit render on a transparent background (aspect ratio preserved). */
export async function squarePng(bytes: Buffer, mime: string, size: number): Promise<Buffer> {
  try {
    return await sharp(bytes, { density: mime === "image/svg+xml" ? 384 : undefined, limitInputPixels: MAX_INPUT_PIXELS })
      .resize({ width: size, height: size, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .png()
      .toBuffer();
  } catch {
    throw new HttpError(422, "Could not process image");
  }
}

/** Builds an ICO container whose images are PNGs (supported since Windows Vista and by all browsers). */
export function buildIco(images: { size: number; png: Buffer }[]): Buffer {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach((img, i) => {
    const o = 6 + 16 * i;
    head[o] = img.size >= 256 ? 0 : img.size;
    head[o + 1] = img.size >= 256 ? 0 : img.size;
    head[o + 2] = 0;
    head[o + 3] = 0;
    head.writeUInt16LE(1, o + 4);
    head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(img.png.length, o + 8);
    head.writeUInt32LE(offset, o + 12);
    offset += img.png.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.png)]);
}

export async function makeFavicons(bytes: Buffer, mime: string): Promise<{ name: string; bytes: Buffer }[]> {
  const pngs = new Map<number, Buffer>();
  for (const s of [...new Set([...FAVICON_FILES.map((f) => f.size), ...ICO_SIZES])]) pngs.set(s, await squarePng(bytes, mime, s));
  return [
    ...FAVICON_FILES.map((f) => ({ name: f.name, bytes: pngs.get(f.size)! })),
    { name: "favicon.ico", bytes: buildIco(ICO_SIZES.map((size) => ({ size, png: pngs.get(size)! }))) },
  ];
}
