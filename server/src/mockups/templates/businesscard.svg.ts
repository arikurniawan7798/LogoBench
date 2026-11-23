import { clip, logoImage, svgDoc, text, type Scene } from "./common.js";

/** 1050x600: front side of a 90x50 card on a neutral surface. Contact details are obviously fake placeholders. */
export function businesscardSvg(s: Scene): string {
  const line = (y: number, t: string, o: { size: number; weight?: number; opacity?: number }) =>
    text(110, y, t, { size: o.size, weight: o.weight, opacity: o.opacity, fill: s.dark, family: s.bodyFamily });
  const body = `
<rect width="1050" height="600" fill="${s.light}"/>
<rect x="84" y="94" width="900" height="440" rx="14" fill="${s.dark}" opacity="0.12"/>
<rect x="75" y="75" width="900" height="450" rx="14" fill="#FFFFFF"/>
<rect x="75" y="75" width="20" height="450" fill="${s.main}"/>
${logoImage(s, 110, 105, 260, 110, "left")}
${text(110, 262, clip(s.name, 28), { size: 38, fill: s.main, family: s.headFamily, weight: 700 })}
<rect x="110" y="284" width="120" height="4" rx="2" fill="${s.accent}"/>
${line(380, "Your Name", { size: 30, weight: 700 })}
${line(416, "Job Title", { size: 22, opacity: 0.7 })}
${line(468, "hello@example.com", { size: 20 })}
${line(498, "+00 000 000 0000  ·  www.example.com", { size: 20 })}`;
  return svgDoc(1050, 600, 1050, 600, body);
}
