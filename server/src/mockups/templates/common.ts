/** Everything a template may interpolate. Built by prepareScene(), which validates/escapes-by-construction:
 * hexes are #RRGGBB, font families are generic CSS names, the logo is a PNG data URI. `name` is raw text:
 * templates MUST pass it through esc() (use the `text()` helper). */
export type Scene = {
  name: string;
  main: string;
  onMain: string;
  accent: string;
  dark: string;
  light: string;
  headFamily: string;
  bodyFamily: string;
  logo: { uri: string; w: number; h: number };
  /** How the logo was prepared (see mockups/logo.ts); "badge" asks the app icon for a white backing badge. */
  logoMode: "asis" | "knockout" | "badge";
  /** The app icon puts the logo on a white badge: a photo-like raster, or a keyed-out mark that is mostly the tile color. */
  iconBadge: boolean;
};

/** XML-escape text and attribute values. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Shorten for tight layouts (by code points, with an ellipsis). */
export function clip(s: string, max: number): string {
  const cps = Array.from(s);
  return cps.length <= max ? s : cps.slice(0, Math.max(0, max - 1)).join("") + "…";
}

/** Contain-fit an iw x ih image inside a bw x bh box (never stretched, may upscale). Degenerate sizes fill the box. */
export function fitBox(iw: number, ih: number, bw: number, bh: number): { w: number; h: number } {
  if (!(iw > 0) || !(ih > 0)) return { w: bw, h: bh };
  const k = Math.min(bw / iw, bh / ih);
  return { w: iw * k, h: ih * k };
}

const n = (v: number) => Number(v.toFixed(2));

/** The logo, contain-fit and centered inside the given box. */
export function logoImage(s: Scene, x: number, y: number, w: number, h: number, anchor: "center" | "left" = "center"): string {
  const f = fitBox(s.logo.w, s.logo.h, w, h);
  const ix = anchor === "left" ? x : x + (w - f.w) / 2;
  const iy = y + (h - f.h) / 2;
  return `<image x="${n(ix)}" y="${n(iy)}" width="${n(f.w)}" height="${n(f.h)}" preserveAspectRatio="xMidYMid meet" xlink:href="${s.logo.uri}"/>`;
}

export type TextOpts = {
  size: number;
  fill: string;
  family: string;
  weight?: number;
  anchor?: "start" | "middle" | "end";
  opacity?: number;
  /** Fixed literal marker for tests (never user text). */
  role?: string;
};

/** A <text> element; content is always escaped. */
export function text(x: number, y: number, content: string, o: TextOpts): string {
  return `<text x="${n(x)}" y="${n(y)}" font-family="${o.family}" font-size="${o.size}" font-weight="${o.weight ?? 400}" fill="${o.fill}" text-anchor="${o.anchor ?? "start"}"${o.opacity !== undefined ? ` opacity="${o.opacity}"` : ""}${o.role ? ` data-role="${esc(o.role)}"` : ""}>${esc(content)}</text>`;
}

// ---- text measuring (estimated) ----
// librsvg picks the actual system face for the generic family, so exact metrics are unknown. These per-character
// advance widths (in em) are deliberately on the wide side of common sans/serif faces, so text laid out with them fits.
const NARROW = new Set([..."iljI.,:;'!|`"]);
const SEMI = new Set([..."frt()[]{}/-\"* "]);
function charEm(ch: string): number {
  if (NARROW.has(ch)) return 0.3;
  if (SEMI.has(ch)) return 0.4;
  if (ch === "m" || ch === "w") return 0.9;
  if (ch === "M" || ch === "W" || ch === "@" || ch === "…") return 1;
  if (/[A-Z]/.test(ch)) return 0.74;
  if (/[a-z0-9]/.test(ch)) return 0.6;
  const cp = ch.codePointAt(0) ?? 0;
  if (cp >= 0x2e80) return 1.1; // CJK, emoji and other wide glyphs
  return 0.7;
}

/** Estimated rendered width of a single line, in user units. Bold text runs about 7% wider. */
export function estimateTextWidth(s: string, size: number, weight = 400): number {
  let em = 0;
  for (const ch of Array.from(s)) em += charEm(ch);
  return em * size * (weight >= 600 ? 1.07 : 1);
}

/** One line that fits maxWidth, ellipsized ("…") when it does not. */
export function fitText(s: string, maxWidth: number, size: number, weight = 400): string {
  if (estimateTextWidth(s, size, weight) <= maxWidth) return s;
  const cps = Array.from(s);
  let lo = 0;
  let hi = cps.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (estimateTextWidth(cps.slice(0, mid).join("").trimEnd() + "…", size, weight) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return cps.slice(0, lo).join("").trimEnd() + "…";
}

/**
 * Greedy word wrap into at most maxLines lines of maxWidth. Words longer than a line are broken. When the text does
 * not fit, the last line is ellipsized. Always returns at least one line.
 */
export function wrapText(s: string, maxWidth: number, size: number, maxLines: number, weight = 400): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const fits = (t: string) => estimateTextWidth(t, size, weight) <= maxWidth;
  const lines: string[] = [];
  let cur = "";
  const queue = [...words];
  while (queue.length) {
    const w = queue.shift()!;
    const next = cur ? `${cur} ${w}` : w;
    if (fits(next)) {
      cur = next;
      continue;
    }
    if (cur) {
      lines.push(cur);
      cur = "";
      queue.unshift(w);
      continue;
    }
    // a single word wider than the line: break it at the widest prefix that fits
    const cps = Array.from(w);
    let k = 1;
    while (k < cps.length && fits(cps.slice(0, k + 1).join(""))) k++;
    lines.push(cps.slice(0, k).join(""));
    queue.unshift(cps.slice(k).join(""));
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines.length ? lines : [""];
  const kept = lines.slice(0, maxLines - 1);
  // The rest never fits on one line here, so fitText always ends it with an ellipsis.
  kept.push(fitText(lines.slice(maxLines - 1).join(" "), maxWidth, size, weight));
  return kept;
}

/** Several <text> lines (baseline of the first at y), each escaped. */
export function textLines(x: number, y: number, lines: string[], lineHeight: number, o: TextOpts): string {
  return lines.map((l, i) => text(x, y + i * lineHeight, l, o)).join("");
}

/** Wrap template body in the root <svg>. vbW x vbH is the design space; width x height the pixel output. */
export function svgDoc(width: number, height: number, vbW: number, vbH: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${vbW} ${vbH}">${body}</svg>`;
}
