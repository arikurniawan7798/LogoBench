import { fitText, logoImage, svgDoc, text, textLines, wrapText, type Scene } from "./common.js";

/** A placeholder list row: avatar dot, two text bars and a chevron. */
function row(s: Scene, y: number, i: number): string {
  const dot = i % 2 === 0 ? s.main : s.accent;
  return `
<rect x="20" y="${y}" width="350" height="60" rx="14" fill="#FFFFFF"/>
<circle cx="50" cy="${y + 30}" r="16" fill="${dot}" opacity="0.85"/>
<rect x="80" y="${y + 18}" width="${150 - i * 22}" height="10" rx="5" fill="${s.dark}" opacity="0.55"/>
<rect x="80" y="${y + 36}" width="${200 - i * 30}" height="8" rx="4" fill="${s.dark}" opacity="0.16"/>
<path d="M346 ${y + 24} l6 6 l-6 6" fill="none" stroke="${s.dark}" stroke-opacity="0.35" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** 390x844 design space rendered at 2x (780x1688): a full phone screen, edge to edge. */
export function mobileSvg(s: Scene): string {
  const title = wrapText(`Hello from ${s.name}`, 350, 26, 2, 700);
  const lh = 32;
  const titleY = 336;
  const subY = titleY + (title.length - 1) * lh + 28;
  const barsY = subY + 20;
  const btnY = barsY + 50;
  // "Recent" list under the button, as many rows as fit above the tab bar (2 or 3).
  const recentY = btnY + 50 + 52;
  let rows = "";
  for (let i = 0, y = recentY + 16; y + 60 <= 756; i++, y += 68) rows += row(s, y, i);
  const tabs = [60, 150, 240, 330]
    .map((x, i) => `<rect x="${x - 11}" y="788" width="22" height="22" rx="${i === 0 ? 6 : 11}" fill="${i === 0 ? s.main : s.dark}" opacity="${i === 0 ? 1 : 0.28}"/>`)
    .join("");
  const body = `
<rect width="390" height="844" fill="${s.light}"/>
<rect width="390" height="44" fill="#FFFFFF"/>
${text(24, 29, "9:41", { size: 15, fill: s.dark, family: s.bodyFamily, weight: 600 })}
<rect x="318" y="17" width="22" height="11" rx="3" fill="none" stroke="${s.dark}" stroke-width="1.2"/>
<rect x="320" y="19" width="14" height="7" rx="1.5" fill="${s.dark}"/>
<rect x="346" y="21" width="3" height="4" rx="1" fill="${s.dark}"/>
<rect y="44" width="390" height="64" fill="#FFFFFF"/>
<rect y="108" width="390" height="1" fill="${s.dark}" opacity="0.12"/>
${logoImage(s, 20, 52, 200, 48, "left")}
<rect x="340" y="68" width="22" height="3" rx="1.5" fill="${s.dark}"/>
<rect x="340" y="76" width="22" height="3" rx="1.5" fill="${s.dark}"/>
<rect x="340" y="84" width="22" height="3" rx="1.5" fill="${s.dark}"/>
<rect x="20" y="126" width="350" height="164" rx="20" fill="${s.accent}" opacity="0.28"/>
<rect x="40" y="150" width="150" height="14" rx="7" fill="${s.main}" opacity="0.7"/>
<rect x="40" y="176" width="210" height="10" rx="5" fill="${s.dark}" opacity="0.16"/>
<rect x="40" y="196" width="170" height="10" rx="5" fill="${s.dark}" opacity="0.16"/>
<circle cx="318" cy="236" r="34" fill="#FFFFFF" opacity="0.85"/>
<circle cx="318" cy="236" r="18" fill="${s.main}" opacity="0.8"/>
${textLines(20, titleY, title, lh, { size: 26, fill: s.dark, family: s.headFamily, weight: 700, role: "hero-title" })}
${text(20, subY, fitText("Placeholder text for your app.", 350, 15), { size: 15, fill: s.dark, family: s.bodyFamily, opacity: 0.7 })}
<rect x="20" y="${barsY}" width="300" height="10" rx="5" fill="${s.dark}" opacity="0.12"/>
<rect x="20" y="${barsY + 20}" width="240" height="10" rx="5" fill="${s.dark}" opacity="0.12"/>
<rect x="20" y="${btnY}" width="350" height="50" rx="25" fill="${s.main}"/>
${text(195, btnY + 32, "Get started", { size: 17, fill: s.onMain, family: s.bodyFamily, weight: 600, anchor: "middle" })}
${text(20, recentY, "Recent", { size: 17, fill: s.dark, family: s.headFamily, weight: 700 })}
${text(370, recentY, "See all", { size: 14, fill: s.main, family: s.bodyFamily, weight: 600, anchor: "end" })}
${rows}
<rect y="770" width="390" height="74" fill="#FFFFFF"/>
<rect y="770" width="390" height="1" fill="${s.dark}" opacity="0.12"/>
${tabs}
<rect x="145" y="830" width="100" height="5" rx="2.5" fill="${s.dark}" opacity="0.6"/>`;
  return svgDoc(780, 1688, 390, 844, body);
}
