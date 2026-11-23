import { clip, logoImage, svgDoc, text, type Scene } from "./common.js";

/** 1280x720 website header + hero. Nav words and copy are obvious placeholders. */
export function websiteSvg(s: Scene): string {
  const nav = ["Home", "About", "Services", "Contact"]
    .map((w, i) => text(640 + i * 110, 50, w, { size: 18, fill: s.dark, family: s.bodyFamily }))
    .join("");
  const body = `
<rect width="1280" height="720" fill="${s.light}"/>
<rect width="1280" height="80" fill="#FFFFFF"/>
<rect y="80" width="1280" height="2" fill="${s.dark}" opacity="0.12"/>
${logoImage(s, 48, 16, 220, 48, "left")}
${nav}
<rect x="1096" y="22" width="136" height="38" rx="19" fill="${s.main}"/>
${text(1164, 47, "Get started", { size: 16, fill: s.onMain, family: s.bodyFamily, weight: 600, anchor: "middle" })}
${text(80, 270, clip(`Welcome to ${s.name}`, 30), { size: 56, fill: s.dark, family: s.headFamily, weight: 700 })}
${text(80, 330, "Your tagline goes here. Placeholder copy only.", { size: 22, fill: s.dark, family: s.bodyFamily, opacity: 0.75 })}
<rect x="80" y="380" width="180" height="52" rx="26" fill="${s.main}"/>
${text(170, 413, "Learn more", { size: 18, fill: s.onMain, family: s.bodyFamily, weight: 600, anchor: "middle" })}
<rect x="740" y="150" width="460" height="460" rx="24" fill="${s.accent}" opacity="0.35"/>
<rect x="780" y="200" width="380" height="24" rx="12" fill="${s.main}" opacity="0.5"/>
<rect x="780" y="250" width="300" height="16" rx="8" fill="${s.dark}" opacity="0.15"/>
<rect x="780" y="284" width="340" height="16" rx="8" fill="${s.dark}" opacity="0.15"/>`;
  return svgDoc(1280, 720, 1280, 720, body);
}
