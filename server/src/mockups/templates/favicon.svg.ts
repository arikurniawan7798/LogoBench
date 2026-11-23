import { clip, logoImage, svgDoc, text, type Scene } from "./common.js";

/** 600x240: a browser tab strip with the logo at favicon size (16px), plus 32px and scaled-up (128px) previews below. */
export function faviconSvg(s: Scene): string {
  const body = `
<rect width="600" height="240" fill="${s.light}"/>
<rect width="600" height="52" fill="${s.dark}" opacity="0.12"/>
<path d="M16 52 V30 a8 8 0 0 1 8 -8 H230 a8 8 0 0 1 8 8 V52 Z" fill="#FFFFFF"/>
${logoImage(s, 30, 29, 16, 16)}
${text(54, 42, clip(s.name, 22), { size: 13, fill: s.dark, family: s.bodyFamily })}
${text(218, 42, "×", { size: 14, fill: s.dark, family: s.bodyFamily, opacity: 0.5 })}
<rect y="52" width="600" height="1" fill="${s.dark}" opacity="0.15"/>
<rect x="40" y="88" width="64" height="64" rx="8" fill="#FFFFFF"/>
${logoImage(s, 40 + 16, 88 + 16, 32, 32)}
${text(72, 180, "32 px", { size: 14, fill: s.dark, family: s.bodyFamily, anchor: "middle", opacity: 0.7 })}
<rect x="160" y="76" width="152" height="152" rx="12" fill="#FFFFFF"/>
${logoImage(s, 160 + 12, 76 + 12, 128, 128)}
${text(236, 224, "scaled up", { size: 14, fill: s.dark, family: s.bodyFamily, anchor: "middle", opacity: 0.7 })}
<rect x="372" y="88" width="48" height="48" rx="6" fill="#FFFFFF"/>
${logoImage(s, 372 + 16, 88 + 16, 16, 16)}
${text(396, 160, "16 px", { size: 14, fill: s.dark, family: s.bodyFamily, anchor: "middle", opacity: 0.7 })}`;
  return svgDoc(600, 240, 600, 240, body);
}
