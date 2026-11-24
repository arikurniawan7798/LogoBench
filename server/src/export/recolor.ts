import { HttpError } from "../errors.js";
import { HEX_RE } from "../colors/convert.js";
import { sanitizeSvg } from "../svg.js";

/**
 * Supported: solid `fill` / `stroke` values written as attributes, in inline `style="..."` declarations and in
 * `<style>` blocks; hex colors (3 or 6 digits, any case) and the basic CSS named colors below.
 * Not supported (left unchanged, with a warning where it matters): rgb()/hsl(), gradients, patterns, images, currentColor.
 */
const NAMED: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", lime: "#00ff00", blue: "#0000ff", yellow: "#ffff00", cyan: "#00ffff", aqua: "#00ffff",
  magenta: "#ff00ff", fuchsia: "#ff00ff", gray: "#808080", grey: "#808080", silver: "#c0c0c0", maroon: "#800000", olive: "#808000",
  green: "#008000", purple: "#800080", teal: "#008080", navy: "#000080", orange: "#ffa500",
};

/** Normalizes a simple solid color token to lowercase #rrggbb, or null if it is not one we handle. */
export function normalizeColor(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return NAMED[v] ?? null;
}

function checkMap(map: Record<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(map ?? {})) {
    if (!HEX_RE.test(k) || typeof v !== "string" || !HEX_RE.test(v)) throw new HttpError(422, "Color map keys and values must be #RRGGBB");
    out.set(k.toLowerCase(), v.toLowerCase());
  }
  return out;
}

const ATTR_RE = /(?<![\w:-])(fill|stroke)(\s*=\s*)(["'])([^"']*)\3/gi;
const DECL_RE = /(?<![\w-])(fill|stroke)(\s*:\s*)([^;"'}]*)/gi;
const STYLE_ATTR_RE = /(?<![\w:-])style(\s*=\s*)(["'])(.*?)\2/gis;
const STYLE_EL_RE = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi;

const IGNORED = /^(none|transparent|inherit|initial|unset|revert|context-fill|context-stroke)$/i;

/** Calls `fn(colorValue)` for every fill/stroke value (attribute, style attribute, <style> block); replaces with the result when non-null. A trailing `!important` is preserved. */
function mapValues(svg: string, fn: (value: string) => string | null): string {
  const rep = (raw: string) => {
    const m = /^(.*?)(\s*!\s*important\s*)$/is.exec(raw);
    const [value, bang] = m ? [m[1], " !important"] : [raw, ""];
    const out = fn(value.trim());
    return out === null ? raw : `${out}${bang}`;
  };
  const decls = (css: string) => css.replace(DECL_RE, (_m, p: string, sep: string, v: string) => `${p}${sep}${rep(v.trim())}`);
  return svg
    .replace(ATTR_RE, (_m, p: string, eq: string, q: string, v: string) => `${p}${eq}${q}${rep(v)}${q}`)
    .replace(STYLE_ATTR_RE, (_m, eq: string, q: string, css: string) => `style${eq}${q}${decls(css)}${q}`)
    .replace(STYLE_EL_RE, (_m, open: string, css: string, close: string) => `${open}${decls(css)}${close}`);
}

/** Distinct simple solid colors (lowercase #rrggbb) used by fill/stroke, in first-seen order. */
export function collectColors(svg: string): string[] {
  const seen = new Set<string>();
  mapValues(svg, (v) => {
    const c = normalizeColor(v);
    if (c) seen.add(c);
    return null;
  });
  return [...seen];
}

function recolor(svg: string, colors: Map<string, string>, currentColor?: string): { svg: string; warnings: string[] } {
  const warnings: string[] = [];
  if (/<(\w+:)?(linearGradient|radialGradient)\b/i.test(svg)) warnings.push("Gradients are not recolored and were left unchanged.");
  if (/<(\w+:)?pattern\b/i.test(svg)) warnings.push("Patterns are not recolored and were left unchanged.");
  if (/<(\w+:)?image\b/i.test(svg)) warnings.push("Embedded images are not recolored and were left unchanged.");
  let urlFill = false;
  const unsupported = new Set<string>();
  const out = mapValues(svg, (v) => {
    if (/^url\(/i.test(v)) {
      urlFill = true;
      return null;
    }
    if (/^currentcolor$/i.test(v)) return currentColor ?? null;
    if (IGNORED.test(v)) return null;
    const c = normalizeColor(v);
    if (!c) {
      unsupported.add(v.replace(/[^ -~]/g, "?").slice(0, 40));
      return null;
    }
    return colors.has(c) ? colors.get(c)! : null;
  });
  if (urlFill && !warnings.some((w) => w.startsWith("Gradients"))) warnings.push("Fills or strokes that reference url(#...) paints were left unchanged.");
  for (const u of unsupported) warnings.push(`Unsupported color value "${u}" was left unchanged (only hex and basic named colors are recolored).`);
  try {
    return { svg: sanitizeSvg(out), warnings };
  } catch {
    throw new HttpError(422, "Could not recolor SVG");
  }
}

export function recolorSvg(svg: string, map: Record<string, string>): { svg: string; warnings: string[] } {
  return recolor(svg, checkMap(map));
}

/** Every simple solid color (and currentColor) becomes `hex`; the root gets `fill=hex` when it has none so un-filled shapes follow. */
export function monochromeSvg(svg: string, hex: string): { svg: string; warnings: string[] } {
  const map = new Map<string, string>();
  for (const c of collectColors(svg)) map.set(c, hex);
  const r = recolor(svg, map, hex);
  const root = /<svg\b[^>]*>/i.exec(r.svg);
  if (!root || /(?<![\w:-])fill\s*=/i.test(root[0])) return r;
  const patched = r.svg.slice(0, root.index) + root[0].replace(/<svg\b/i, `<svg fill="${hex}"`) + r.svg.slice(root.index + root[0].length);
  return { svg: sanitizeSvg(patched), warnings: r.warnings };
}
