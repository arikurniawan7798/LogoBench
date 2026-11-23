import sharp from "sharp";
import { HttpError } from "../errors.js";
import { rasterizeToPng } from "../image/raster.js";
import { colorDistance, rgbToHex, type RGB } from "./convert.js";

const SIZE = 128;
const MIN_ALPHA = 16;
const MERGE_DISTANCE = 60;
const MAX_INPUT_PIXELS = 50_000_000;

type Cluster = { count: number; mean: RGB };

/** Dominant colors of a logo: [{hex, share}] sorted by share desc; shares are fractions of visible pixels and sum to <= 1. */
export async function extractPalette(bytes: Buffer, mime: string, n = 6): Promise<{ hex: string; share: number }[]> {
  let raw: { data: Buffer; info: { width: number; height: number } };
  try {
    // SVG/WebP go through the shared rasterizer; PNG/JPG are decoded directly (with EXIF orientation applied).
    const src =
      mime === "image/svg+xml" || mime === "image/webp"
        ? sharp(await rasterizeToPng(bytes, mime, { maxSize: SIZE }))
        : sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
    raw = await src.resize({ width: SIZE, height: SIZE, fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(422, "Could not process image");
  }

  // 4 bits per channel buckets.
  const buckets = new Map<number, { count: number; sum: [number, number, number] }>();
  let total = 0;
  const { data } = raw;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < MIN_ALPHA) continue;
    total++;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const b = buckets.get(key) ?? { count: 0, sum: [0, 0, 0] as [number, number, number] };
    b.count++;
    b.sum[0] += data[i];
    b.sum[1] += data[i + 1];
    b.sum[2] += data[i + 2];
    buckets.set(key, b);
  }
  if (total === 0) throw new HttpError(422, "no visible pixels");

  // Merge near-duplicate buckets (largest first) so anti-aliasing and gradients collapse into their dominant color.
  const clusters: Cluster[] = [];
  for (const b of [...buckets.values()].sort((a, c) => c.count - a.count)) {
    const mean: RGB = [b.sum[0] / b.count, b.sum[1] / b.count, b.sum[2] / b.count];
    const hit = clusters.find((c) => colorDistance(c.mean, mean) < MERGE_DISTANCE);
    // The leading (largest) bucket keeps its exact color; merged buckets only add to its share.
    if (hit) hit.count += b.count;
    else clusters.push({ count: b.count, mean });
  }
  clusters.sort((a, c) => c.count - a.count);
  return clusters.slice(0, Math.max(1, n)).map((c) => ({ hex: rgbToHex(c.mean), share: c.count / total }));
}
