import { logoImage, svgDoc, text, textLines, wrapText, type Scene } from "./common.js";

/** Card text column: x=110 to 940 (the card's right edge is 975). */
const NAME_X = 110;
const NAME_W = 830;

/** 1050x600: front side of a 90x50 card on a neutral surface. Contact details are obviously fake placeholders. */
export function businesscardSvg(s: Scene): string {
  const line = (y: number, t: string, o: { size: number; weight?: number; opacity?: number }) =>
    text(NAME_X, y, t, { size: o.size, weight: o.weight, opacity: o.opacity, fill: s.dark, family: s.bodyFamily });
  // One line at 38px when it fits, else two lines at 32px (the second ellipsized if still too long).
  let size = 38;
  let lines = wrapText(s.name, NAME_W, size, 1, 700);
  if (lines[0].endsWith("…")) {
    size = 32;
    lines = wrapText(s.name, NAME_W, size, 2, 700);
  }
  const lh = Math.round(size * 1.2);
  const first = lines.length > 1 ? 250 : 262;
  const barY = first + (lines.length - 1) * lh + 20;
  const body = `
<rect width="1050" height="600" fill="${s.light}"/>
<rect x="84" y="94" width="900" height="440" rx="14" fill="${s.dark}" opacity="0.12"/>
<rect x="75" y="75" width="900" height="450" rx="14" fill="#FFFFFF"/>
<rect x="75" y="75" width="20" height="450" fill="${s.main}"/>
${logoImage(s, NAME_X, 100, 320, 100, "left")}
${textLines(NAME_X, first, lines, lh, { size, fill: s.main, family: s.headFamily, weight: 700, role: "brand" })}
<rect x="${NAME_X}" y="${barY}" width="120" height="4" rx="2" fill="${s.accent}"/>
${line(384, "Your Name", { size: 30, weight: 700 })}
${line(420, "Job Title", { size: 22, opacity: 0.7 })}
${line(468, "hello@example.com", { size: 20 })}
${line(498, "+00 000 000 0000  ·  www.example.com", { size: 20 })}`;
  return svgDoc(1050, 600, 1050, 600, body);
}
