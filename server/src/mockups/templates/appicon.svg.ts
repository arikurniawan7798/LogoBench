import { logoImage, svgDoc, type Scene } from "./common.js";

export const APPICON_TILE = { x: 64, y: 64, size: 384, radius: 88 };
/** The logo fills at most this share of the tile edge. */
export const APPICON_LOGO_SHARE = 0.6;

/** 512x512: a rounded-square tile in the main color on a neutral backdrop, logo centered at <= 60% of the tile. */
export function appiconSvg(s: Scene): string {
  const { x, y, size, radius } = APPICON_TILE;
  const box = size * APPICON_LOGO_SHARE;
  const body = `
<rect width="512" height="512" fill="${s.light}"/>
<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="${s.main}"/>
${logoImage(s, x + (size - box) / 2, y + (size - box) / 2, box, box)}`;
  return svgDoc(512, 512, 512, 512, body);
}
