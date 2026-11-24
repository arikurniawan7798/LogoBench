import { fitText, logoImage, svgDoc, text, textLines, wrapText, type Scene } from "./common.js";

/** Left edge of the hero illustration; the heading column always ends well before it. */
export const WEBSITE_HERO_ART_X = 760;
const COL_X = 80;
const COL_W = 600;
const HEADER_H = 96;

/** Largest heading size whose wrap shows the whole text in <= 3 lines; the smallest size ellipsizes otherwise. */
function heading(t: string): { size: number; lines: string[] } {
  for (const size of [56, 48, 42]) {
    const lines = wrapText(t, COL_W, size, 3, 700);
    if (!lines[lines.length - 1].endsWith("…")) return { size, lines };
  }
  return { size: 42, lines: wrapText(t, COL_W, 42, 3, 700) };
}

/** 1280x720 website header + hero. Nav words and copy are obvious placeholders. */
export function websiteSvg(s: Scene): string {
  const navX = [676, 768, 862, 976];
  const nav = ["Home", "About", "Services", "Contact"]
    .map((w, i) => text(navX[i], 55, w, { size: 17, fill: s.dark, family: s.bodyFamily }))
    .join("");

  const h = heading(`Welcome to ${s.name}`);
  const lh = Math.round(h.size * 1.14);
  const block = h.lines.length * lh + 26 + 22 + 40 + 52;
  const top = Math.max(HEADER_H + 40, Math.round((HEADER_H + 720) / 2 - block / 2));
  const first = top + Math.round(h.size * 0.86);
  const tagY = first + (h.lines.length - 1) * lh + 48;
  const btnY = tagY + 34;
  const art = WEBSITE_HERO_ART_X;

  const body = `
<rect width="1280" height="720" fill="${s.light}"/>
<rect width="1280" height="${HEADER_H}" fill="#FFFFFF"/>
<rect y="${HEADER_H}" width="1280" height="2" fill="${s.dark}" opacity="0.1"/>
${logoImage(s, 48, 16, 260, 64, "left")}
${nav}
<rect x="1092" y="26" width="140" height="44" rx="22" fill="${s.main}"/>
${text(1162, 54, "Get started", { size: 16, fill: s.onMain, family: s.bodyFamily, weight: 600, anchor: "middle" })}
${textLines(COL_X, first, h.lines, lh, { size: h.size, fill: s.dark, family: s.headFamily, weight: 700, role: "hero-title" })}
${text(COL_X, tagY, fitText("Your tagline goes here. Placeholder copy only.", COL_W, 22), { size: 22, fill: s.dark, family: s.bodyFamily, opacity: 0.75 })}
<rect x="${COL_X}" y="${btnY}" width="180" height="52" rx="26" fill="${s.main}"/>
${text(COL_X + 90, btnY + 33, "Learn more", { size: 18, fill: s.onMain, family: s.bodyFamily, weight: 600, anchor: "middle" })}
<rect x="${COL_X + 196}" y="${btnY}" width="160" height="52" rx="26" fill="none" stroke="${s.dark}" stroke-opacity="0.25" stroke-width="2"/>
${text(COL_X + 276, btnY + 33, "Contact us", { size: 18, fill: s.dark, family: s.bodyFamily, weight: 600, anchor: "middle" })}
<rect x="${art}" y="150" width="440" height="460" rx="24" fill="${s.accent}" opacity="0.28"/>
<rect x="${art + 36}" y="186" width="368" height="190" rx="16" fill="#FFFFFF"/>
<rect x="${art + 60}" y="214" width="180" height="20" rx="10" fill="${s.main}" opacity="0.6"/>
<rect x="${art + 60}" y="252" width="300" height="12" rx="6" fill="${s.dark}" opacity="0.14"/>
<rect x="${art + 60}" y="276" width="260" height="12" rx="6" fill="${s.dark}" opacity="0.14"/>
<rect x="${art + 60}" y="316" width="110" height="34" rx="17" fill="${s.main}"/>
<rect x="${art + 36}" y="400" width="176" height="174" rx="16" fill="#FFFFFF"/>
<circle cx="${art + 124}" cy="460" r="30" fill="${s.main}" opacity="0.85"/>
<rect x="${art + 70}" y="512" width="108" height="12" rx="6" fill="${s.dark}" opacity="0.14"/>
<rect x="${art + 86}" y="534" width="76" height="10" rx="5" fill="${s.dark}" opacity="0.1"/>
<rect x="${art + 228}" y="400" width="176" height="174" rx="16" fill="#FFFFFF"/>
<circle cx="${art + 316}" cy="460" r="30" fill="${s.accent}" opacity="0.85"/>
<rect x="${art + 262}" y="512" width="108" height="12" rx="6" fill="${s.dark}" opacity="0.14"/>
<rect x="${art + 278}" y="534" width="76" height="10" rx="5" fill="${s.dark}" opacity="0.1"/>`;
  return svgDoc(1280, 720, 1280, 720, body);
}
