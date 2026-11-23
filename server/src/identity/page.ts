import { HEX_RE } from "../colors/convert.js";
import type { BrandPalette, Swatch } from "../colors/roles.js";
import { DIMENSIONS, type ReviewResult } from "../review/schema.js";
import { SIZE_RE, loadFonts, type TypeSystem } from "../type/pairings.js";
import { FAMILY_RE } from "./fonts.js";

/**
 * HTML-escape text for element content and quoted attributes. '/' is escaped too, so no text (project name,
 * AI output) can ever form a literal "https://" or "</" sequence in the page.
 */
export function escapeHtml(v: unknown): string {
  return String(v ?? "").replace(/[&<>"'/]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "/": "&#47;" })[c]!);
}

export type PageFont = { family: string; faces: { file: string; weight: string; style: string; unicodeRange?: string }[] };

export type IdentityPageInput = {
  name: string;
  logoFile: string; // relative path inside the bundle, e.g. assets/logo.svg
  palette: BrandPalette;
  type: TypeSystem;
  fonts: PageFont[]; // families that were bundled (faces may be empty when the download failed)
  mockups: { file: string; label: string }[];
  review?: ReviewResult;
  warnings: string[];
};

const STACK: Record<string, string> = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  display: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  script: "'Segoe Script', 'Brush Script MT', cursive",
  mono: "ui-monospace, 'Cascadia Mono', Consolas, Menlo, monospace",
};

/** CSS font-family value: the brand family (validated, quoted) followed by a system stack for its category. */
export function familyStack(family: string | undefined): string {
  const f = family && FAMILY_RE.test(family) ? family : undefined;
  const cat = f ? loadFonts().find((x) => x.family.toLowerCase() === f.toLowerCase())?.category : undefined;
  const stack = STACK[cat ?? "sans"];
  return f ? `'${f}', ${stack}` : stack;
}

const hex = (v: string, fallback: string) => (HEX_RE.test(v) ? v.toUpperCase() : fallback);
const size = (v: string, fallback: string) => (SIZE_RE.test(v) ? v : fallback);
/** Bundle-relative asset path: fixed alphabet only, so it is safe inside quoted attributes and url(''). */
const asset = (p: string) => {
  if (!/^assets\/[a-z0-9/._-]+$/.test(p) || p.includes("..")) throw new Error(`Unsafe asset path: ${p}`);
  return p;
};

function fontFaceCss(fonts: PageFont[]): string {
  const rules: string[] = [];
  for (const f of fonts) {
    if (!FAMILY_RE.test(f.family)) continue;
    for (const face of f.faces) {
      if (!/^\d{3}( \d{3})?$/.test(face.weight)) continue;
      const style = face.style === "italic" ? "italic" : "normal";
      const range = face.unicodeRange && /^[U+0-9A-Fa-f?, -]+$/.test(face.unicodeRange) ? `\n  unicode-range: ${face.unicodeRange};` : "";
      rules.push(`@font-face {
  font-family: '${f.family}';
  font-style: ${style};
  font-weight: ${face.weight};
  font-display: swap;
  src: url('${asset(`assets/fonts/${face.file}`)}') format('woff2');${range}
}`);
    }
  }
  return rules.join("\n");
}

function swatchCard(s: Swatch, role: string): string {
  const h = hex(s.hex, "#000000");
  const [r, g, b] = s.rgb;
  const [c, m, y, k] = s.cmyk;
  return `<figure class="swatch">
  <div class="chip" style="background:${h}"></div>
  <figcaption><strong>${escapeHtml(s.name ?? role)}</strong><span class="role">${escapeHtml(role)}</span>
  <code>${h}</code><code>RGB ${Number(r)} ${Number(g)} ${Number(b)}</code><code>CMYK ${Number(c)} ${Number(m)} ${Number(y)} ${Number(k)}*</code></figcaption>
</figure>`;
}

function reviewSection(review: ReviewResult | undefined): string {
  if (!review) return "";
  const rows = DIMENSIONS.map((d) => {
    const s = review.scores?.[d];
    if (!s) return "";
    return `<tr><th>${escapeHtml(d)}</th><td>${escapeHtml(s.score)}&#47;10</td><td>${escapeHtml(s.reason)}</td></tr>`;
  }).join("\n");
  const personality = Object.entries(review.personality ?? {})
    .map(([k, v]) => `<li><span>${escapeHtml(k)}</span> ${escapeHtml(v)}</li>`)
    .join("");
  return `<section>
  <h2>Logo review</h2>
  <p>${escapeHtml(review.summary)}</p>
  ${personality ? `<ul class="personality">${personality}</ul>` : ""}
  <table class="scores">${rows}</table>
</section>`;
}

/** The standalone identity page. Every inserted string is escaped or validated; all references are bundle-relative. */
export function buildIdentityPage(input: IdentityPageInput): string {
  const { palette, type } = input;
  const main = hex(palette.main.hex, "#2B4C7E");
  const web = type.scale.web;
  const social = type.scale.social;
  const swatches = [
    swatchCard(palette.main, "Main"),
    ...palette.support.map((s) => swatchCard(s, "Support")),
    ...palette.neutral.map((s) => swatchCard(s, "Neutral")),
  ].join("\n");
  const typeRows = (
    [
      ["Heading", type.heading],
      ["Body", type.body],
      ...(type.accent ? [["Accent", type.accent]] : []),
    ] as [string, string][]
  )
    .map(([role, fam]) => `<div class="specimen" style="font-family:${escapeHtml(familyStack(fam))}"><span class="role">${escapeHtml(role)}</span><p class="big">${escapeHtml(fam)}</p><p>The quick brown fox jumps over the lazy dog. 0123456789</p></div>`)
    .join("\n");
  const scale = [
    ...Object.entries(web).map(([k, v]) => `<tr><th>Web ${escapeHtml(k)}</th><td><code>${escapeHtml(size(v, "1rem"))}</code></td></tr>`),
    ...Object.entries(social).map(([k, v]) => `<tr><th>Social ${escapeHtml(k)}</th><td><code>${escapeHtml(size(v, "16px"))}</code></td></tr>`),
  ].join("\n");
  const mockups = input.mockups
    .map((m) => `<figure class="mockup"><img src="${asset(m.file)}" alt="${escapeHtml(m.label)}" loading="lazy"><figcaption>${escapeHtml(m.label)}</figcaption></figure>`)
    .join("\n");
  const warnings = input.warnings.length
    ? `<aside class="warnings"><strong>Notes</strong><ul>${input.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul></aside>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.name)} brand identity</title>
<style>
${fontFaceCss(input.fonts)}
:root { --main: ${main}; --ink: #1d1f24; --muted: #5d6470; --line: #e3e6eb; --bg: #fbfbfc; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: ${familyStack(type.body)}; font-size: ${size(web.body, "1rem")}; line-height: 1.55; }
main { max-width: 1040px; margin: 0 auto; padding: 48px 20px 64px; }
h1, h2, h3 { font-family: ${familyStack(type.heading)}; line-height: 1.15; margin: 0 0 .5em; }
h1 { font-size: ${size(web.h1, "2rem")}; }
h2 { font-size: ${size(web.h2, "1.5rem")}; border-top: 4px solid var(--main); padding-top: 18px; margin-top: 56px; }
small, .role, figcaption { font-size: ${size(web.small, "0.8rem")}; color: var(--muted); }
header { display: flex; flex-wrap: wrap; align-items: center; gap: 32px; }
header .logo { width: 220px; max-width: 100%; height: 160px; object-fit: contain; background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 16px; }
.swatch { margin: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: #fff; }
.swatch .chip { height: 96px; }
.swatch figcaption { display: grid; gap: 2px; padding: 10px 12px; }
.swatch strong { color: var(--ink); font-size: 1rem; }
code { font-family: ui-monospace, Consolas, Menlo, monospace; font-size: .85em; }
.specimen { border: 1px solid var(--line); border-radius: 12px; padding: 16px 20px; margin-bottom: 12px; background: #fff; }
.specimen .big { font-size: ${size(web.h2, "1.5rem")}; margin: 4px 0; }
.specimen p { margin: 0; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { text-transform: capitalize; white-space: nowrap; }
.mockups { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
.mockup { margin: 0; }
.mockup img { width: 100%; height: auto; border-radius: 10px; border: 1px solid var(--line); background: #fff; }
.personality { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; padding: 0; }
.personality li { border: 1px solid var(--line); border-radius: 999px; padding: 4px 12px; background: #fff; }
.personality span { color: var(--muted); text-transform: capitalize; margin-right: 4px; }
.warnings { border: 1px solid #e8c66a; background: #fff8e1; border-radius: 10px; padding: 12px 16px; margin-top: 24px; }
.warnings ul { margin: 6px 0 0; padding-left: 20px; }
footer { margin-top: 56px; color: var(--muted); font-size: ${size(web.small, "0.8rem")}; }
</style>
</head>
<body>
<main>
<header>
  <img class="logo" src="${asset(input.logoFile)}" alt="${escapeHtml(input.name)} logo">
  <div><h1>${escapeHtml(input.name)}</h1><p class="role">Brand identity</p>${palette.rationale ? `<p>${escapeHtml(palette.rationale)}</p>` : ""}</div>
</header>
${warnings}
<section>
  <h2>Colors</h2>
  <div class="grid">
${swatches}
  </div>
  <p><small>* CMYK values are approximate, not print-accurate.</small></p>
</section>
<section>
  <h2>Typography</h2>
${typeRows}
  <table class="scale">${scale}</table>
</section>
${mockups ? `<section>\n  <h2>Mockups</h2>\n  <div class="mockups">\n${mockups}\n  </div>\n</section>` : ""}
${reviewSection(input.review)}
<footer>This page and its assets work offline. Fonts are included under their Google Fonts open licenses.</footer>
</main>
</body>
</html>
`;
}
