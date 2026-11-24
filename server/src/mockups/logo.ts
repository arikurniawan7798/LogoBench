import sharp from "sharp";

/**
 * How a raster logo is placed on colored surfaces (the app icon tile):
 *  - "asis":     SVG, already-transparent rasters, and single-color swatches. Used unchanged.
 *  - "knockout": an opaque raster on a near-uniform background (a JPG on white). The background is keyed out by color
 *                from the image edges (flood fill, so enclosed areas of the same color survive), with a soft edge, and
 *                the result is trimmed to the mark.
 *  - "badge":    an opaque raster whose background is not uniform (photo-like) or is barely there. Shown on a white
 *                rounded badge with deliberate padding instead of being cut out.
 * Pure and deterministic: same bytes in, same bytes out.
 */
export type LogoMode = "asis" | "knockout" | "badge";
export type PreparedLogo = { png: Buffer; w: number; h: number; mode: LogoMode };

/** Color distance (RGB Euclidean) up to which a pixel is fully background. */
const KEY_INNER = 26;
/** Up to this distance a pixel connected to the background is partly transparent (soft, anti-aliased edge). */
const KEY_OUTER = 80;
/** Edge pixels this close to the median edge color count as "uniform". */
const EDGE_TOL = 40;
/** Share of edge pixels that must match for the background to count as uniform. */
const EDGE_UNIFORM = 0.9;
/** Below this background share the logo is "mostly mark" (badge); above SOLID it is a single-color swatch (as-is). */
const BG_MIN = 0.12;
const BG_SOLID = 0.985;

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1] ?? 0;
};

/** Distance under which a logo pixel reads as "the same color" as the tile behind it. */
const CLASH_DIST = 70;
/** Share of the mark's opaque pixels that may match the tile color before the mark needs a white badge. */
export const CLASH_MAX = 0.2;

/** Share of the logo's visible pixels (alpha > 50%) whose color is close to `rgb`. Deterministic. */
export async function colorClashShare(png: Buffer, rgb: [number, number, number]): Promise<number> {
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let seen = 0;
  let close = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    seen++;
    if (Math.hypot(data[i] - rgb[0], data[i + 1] - rgb[1], data[i + 2] - rgb[2]) < CLASH_DIST) close++;
  }
  return seen ? close / seen : 0;
}

export async function prepareLogo(png: Buffer, isVector: boolean): Promise<PreparedLogo> {
  const meta = await sharp(png).metadata();
  const asis: PreparedLogo = { png, w: meta.width ?? 1, h: meta.height ?? 1, mode: "asis" };
  if (isVector) return asis;

  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  if (W < 4 || H < 4) return asis;
  const px = (x: number, y: number) => (y * W + x) * 4;

  // Edge ring: every pixel on the outer border.
  const edge: number[] = [];
  for (let x = 0; x < W; x++) edge.push(px(x, 0), px(x, H - 1));
  for (let y = 1; y < H - 1; y++) edge.push(px(0, y), px(W - 1, y));
  if (edge.some((i) => data[i + 3] < 250)) return asis; // already has transparency: the author decided

  const bg = [0, 1, 2].map((c) => median(edge.map((i) => data[i + c])));
  const dist = (i: number) => Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
  const uniform = edge.filter((i) => dist(i) <= EDGE_TOL).length / edge.length;
  if (uniform < EDGE_UNIFORM) return { ...asis, mode: "badge" };

  // Flood fill from the edges through background-like pixels (4-connected).
  const n = W * H;
  const inBg = new Uint8Array(n);
  const stack: number[] = [];
  for (const i of edge) {
    const p = i >> 2;
    if (!inBg[p] && dist(i) <= KEY_OUTER) {
      inBg[p] = 1;
      stack.push(p);
    }
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % W;
    const y = (p - x) / W;
    const visit = (q: number) => {
      if (!inBg[q] && dist(q * 4) <= KEY_OUTER) {
        inBg[q] = 1;
        stack.push(q);
      }
    };
    if (x > 0) visit(p - 1);
    if (x < W - 1) visit(p + 1);
    if (y > 0) visit(p - W);
    if (y < H - 1) visit(p + W);
  }
  let bgCount = 0;
  for (let p = 0; p < n; p++) bgCount += inBg[p];
  const share = bgCount / n;
  if (share >= BG_SOLID) return asis; // a solid swatch: nothing to cut out
  if (share < BG_MIN) return { ...asis, mode: "badge" };

  // Key out: alpha ramps from 0 (at KEY_INNER) to 255 (at KEY_OUTER); partly transparent pixels are un-mixed from
  // the background color so no light fringe remains on dark tiles.
  const out = Buffer.from(data);
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (inBg[p]) {
      const d = dist(i);
      const a = d <= KEY_INNER ? 0 : Math.min(1, (d - KEY_INNER) / (KEY_OUTER - KEY_INNER));
      out[i + 3] = Math.round(a * 255);
      if (a > 0 && a < 1) for (let c = 0; c < 3; c++) out[i + c] = Math.max(0, Math.min(255, Math.round((data[i + c] - bg[c] * (1 - a)) / a)));
    }
    if (out[i + 3] > 8) {
      const x = p % W;
      const y = (p - x) / W;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return asis;
  const pad = 1;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const w = Math.min(W, maxX + pad + 1) - left;
  const h = Math.min(H, maxY + pad + 1) - top;
  const keyed = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left, top, width: w, height: h })
    .png()
    .toBuffer();
  return { png: keyed, w, h, mode: "knockout" };
}
