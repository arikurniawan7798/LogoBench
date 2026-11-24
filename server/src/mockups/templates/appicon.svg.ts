import { fitBox, logoImage, svgDoc, type Scene } from "./common.js";

export const APPICON_TILE = { x: 64, y: 64, size: 384, radius: 88 };
/** Safe area for the logo, as shares of the tile edge: up to 72% wide (wordmarks) and 60% tall (square marks). */
export const APPICON_LOGO_SHARE = { w: 0.72, h: 0.6 };

/**
 * 512x512: a rounded-square tile in the main color on a neutral backdrop, logo centered inside the safe area.
 * With scene.iconBadge (a photo-like raster, or a keyed-out mark mostly in the tile color; see mockups/logo.ts) the
 * logo sits on a white rounded badge with padding; otherwise keyed-out and transparent logos sit directly on the tile.
 */
export function appiconSvg(s: Scene): string {
  const { x, y, size, radius } = APPICON_TILE;
  const bw = size * APPICON_LOGO_SHARE.w;
  const bh = size * APPICON_LOGO_SHARE.h;
  const cx = x + size / 2;
  const cy = y + size / 2;
  let mark: string;
  if (s.iconBadge) {
    const pad = Math.round(bh * 0.1);
    const inner = fitBox(s.logo.w, s.logo.h, bw - 2 * pad, bh - 2 * pad);
    const w = inner.w + 2 * pad;
    const h = inner.h + 2 * pad;
    mark = `<rect data-role="badge" x="${(cx - w / 2).toFixed(2)}" y="${(cy - h / 2).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${Math.round(Math.min(w, h) * 0.14)}" fill="#FFFFFF"/>
${logoImage(s, cx - inner.w / 2, cy - inner.h / 2, inner.w, inner.h)}`;
  } else {
    mark = logoImage(s, cx - bw / 2, cy - bh / 2, bw, bh);
  }
  const body = `
<rect width="512" height="512" fill="${s.light}"/>
<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="${s.main}"/>
${mark}`;
  return svgDoc(512, 512, 512, 512, body);
}
