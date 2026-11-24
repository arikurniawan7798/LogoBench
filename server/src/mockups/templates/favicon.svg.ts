import { fitText, logoImage, svgDoc, text, type Scene } from "./common.js";

/**
 * 600x240: a browser tab strip with the logo at true favicon size (16 px), a large 128 px preview as the hero, and
 * honest 32 px / 16 px tiles plus a 16 px dark-tab sample. Small sizes are drawn at their real size, never enlarged.
 */
export function faviconSvg(s: Scene): string {
  const label = (x: number, t: string) => text(x, 226, t, { size: 13, fill: s.dark, family: s.bodyFamily, anchor: "middle", opacity: 0.7 });
  const body = `
<rect width="600" height="240" fill="${s.light}"/>
<rect width="600" height="52" fill="${s.dark}" opacity="0.1"/>
<path d="M16 52 V30 a8 8 0 0 1 8 -8 H308 a8 8 0 0 1 8 8 V52 Z" fill="#FFFFFF"/>
${logoImage(s, 30, 29, 16, 16)}
${text(54, 42, fitText(s.name, 226, 13), { size: 13, fill: s.dark, family: s.bodyFamily, role: "tab-title" })}
${text(296, 42, "×", { size: 14, fill: s.dark, family: s.bodyFamily, opacity: 0.5 })}
<rect x="332" y="30" width="160" height="14" rx="7" fill="${s.dark}" opacity="0.08"/>
<rect y="52" width="600" height="1" fill="${s.dark}" opacity="0.15"/>
<rect x="32" y="66" width="140" height="140" rx="16" fill="#FFFFFF"/>
${logoImage(s, 32 + 10, 66 + 10, 120, 120)}
${label(102, "128 px")}
<rect x="226" y="104" width="64" height="64" rx="10" fill="#FFFFFF"/>
${logoImage(s, 226 + 16, 104 + 16, 32, 32)}
${label(258, "32 px")}
<rect x="338" y="112" width="48" height="48" rx="8" fill="#FFFFFF"/>
${logoImage(s, 338 + 16, 112 + 16, 16, 16)}
${label(362, "16 px")}
<rect x="430" y="112" width="140" height="48" rx="8" fill="#202124"/>
<rect x="442" y="124" width="24" height="24" rx="4" fill="#FFFFFF"/>
${logoImage(s, 442 + 4, 124 + 4, 16, 16)}
<rect x="476" y="131" width="80" height="10" rx="5" fill="#FFFFFF" opacity="0.35"/>
${label(500, "dark tab")}`;
  return svgDoc(600, 240, 600, 240, body);
}
