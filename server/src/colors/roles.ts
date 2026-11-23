import { MIN_SHARE } from "./extract.js";
import { colorDistance, hexToRgb, hslToRgb, rgbToCmyk, rgbToHex, rgbToHsl, type CMYK, type RGB } from "./convert.js";

/** cmyk is a naive conversion: approximate, not print-accurate. */
export type Swatch = { hex: string; rgb: RGB; cmyk: CMYK; cmykApproximate: true; name?: string };
export type BrandPalette = { main: Swatch; support: Swatch[]; neutral: Swatch[]; rationale?: string };

export const MAX_SUPPORT = 6;
export const MAX_NEUTRAL = 4;

/** Build a swatch from a hex: rgb and cmyk are always derived so they cannot drift. */
export function makeSwatch(hex: string, name?: string): Swatch {
  const h = hex.toUpperCase();
  const rgb = hexToRgb(h);
  return { hex: h, rgb, cmyk: rgbToCmyk(rgb), cmykApproximate: true, ...(name ? { name } : {}) };
}

const BACKDROP_L = 0.93; // HSL lightness at/above which a color counts as a near-white backdrop
const SAT_MIN = 0.2; // below this (HSL saturation) a color counts as neutral
const SUPPORT_MIN_DIST = 70;

/** Deterministic roles: main = most prominent chromatic color (else the largest), support = other chromatic colors, neutral = generated dark/light tints plus any greys found. */
export function assignRoles(colors: { hex: string; share: number }[]): BrandPalette {
  const items = colors.map((c) => {
    const rgb = hexToRgb(c.hex);
    const [h, s, l] = rgbToHsl(rgb);
    // Saturation is meaningless near black/white; damp it there.
    const sat = s * (1 - Math.abs(2 * l - 1) ** 4);
    return { hex: c.hex.toUpperCase(), share: c.share, rgb, h, s, l, sat };
  });
  if (items.length === 0) return defaultPalette();

  const chromatic = items.filter((c) => c.sat >= SAT_MIN);
  // A near-white backdrop (typical opaque JPG/PNG logo) is not the brand color unless nothing else exists.
  const nonBackdrop = items.filter((c) => c.l < BACKDROP_L);
  const preferred = chromatic.filter((c) => c.l < BACKDROP_L);
  const pool = preferred.length ? preferred : chromatic.length ? chromatic : nonBackdrop.length ? nonBackdrop : items;
  const main = pool.reduce((best, c) => (c.share * (0.25 + c.sat) > best.share * (0.25 + best.sat) ? c : best));

  const support: typeof items = [];
  for (const c of chromatic) {
    if (c === main || c.share < MIN_SHARE) continue;
    if (colorDistance(c.rgb, main.rgb) < SUPPORT_MIN_DIST) continue;
    if (support.some((s) => colorDistance(s.rgb, c.rgb) < SUPPORT_MIN_DIST)) continue;
    support.push(c);
    if (support.length >= 3) break;
  }

  // Generated neutrals take the main hue (when it has one) so they sit well with the brand color.
  const hue = main.sat >= SAT_MIN ? main.h : 220;
  const tint = main.sat >= SAT_MIN ? 0.12 : 0.04;
  const generated: RGB[] = [hslToRgb(hue, tint, 0.1), hslToRgb(hue, tint, 0.96)];
  const neutral: RGB[] = [...generated];
  for (const c of items) {
    if (c === main || c.sat >= SAT_MIN || neutral.length >= MAX_NEUTRAL) continue;
    if (neutral.some((n) => colorDistance(n, c.rgb) < 30) || colorDistance(main.rgb, c.rgb) < 30) continue;
    neutral.push(c.rgb);
  }

  return {
    main: makeSwatch(main.hex),
    support: support.map((c) => makeSwatch(c.hex)),
    neutral: neutral.map((r) => makeSwatch(rgbToHex(r))),
  };
}

/** Neutral, deterministic palette (no AI, no image) for fallbacks such as workflows and mockups. */
export function defaultPalette(): BrandPalette {
  const p = assignRoles([{ hex: "#2B4C7E", share: 1 }]);
  return p;
}
