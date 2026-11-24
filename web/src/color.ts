import type { CMYK, RGB, Swatch } from "./api";

/** Same rule as the server (server/src/colors/convert.ts HEX_RE). */
export const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Naive RGB to CMYK, matching the server: approximate, not print-accurate. */
export function rgbToCmyk([r, g, b]: RGB): CMYK {
  const rr = r / 255,
    gg = g / 255,
    bb = b / 255;
  const k = 1 - Math.max(rr, gg, bb);
  if (k >= 1) return [0, 0, 0, 100];
  const f = (v: number) => Math.round(((1 - v - k) / (1 - k)) * 100) + 0;
  return [f(rr), f(gg), f(bb), Math.round(k * 100) + 0];
}

/** Swatch rebuilt from its hex so rgb/cmyk cannot drift (the server rebuilds them again on save). */
export function makeSwatch(hex: string, name?: string): Swatch {
  const h = hex.toUpperCase();
  const rgb = hexToRgb(h);
  return { hex: h, rgb, cmyk: rgbToCmyk(rgb), cmykApproximate: true, ...(name ? { name } : {}) };
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on `bg`. */
export function inkOn(bg: string): string {
  return contrastRatio(bg, "#000000") >= contrastRatio(bg, "#FFFFFF") ? "#000000" : "#FFFFFF";
}

/** A safe CSS color for inline styles: only validated #RRGGBB passes, anything else becomes a neutral grey. */
export function safeHex(hex: string): string {
  return HEX_RE.test(hex) ? hex : "#808080";
}
