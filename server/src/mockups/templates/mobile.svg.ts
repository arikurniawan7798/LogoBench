import { clip, logoImage, svgDoc, text, type Scene } from "./common.js";

/** 390x844 design space rendered at 2x (780x1688): status bar, header, hero text and a main-color button. */
export function mobileSvg(s: Scene): string {
  const body = `
<rect width="390" height="844" fill="${s.light}"/>
<rect width="390" height="44" fill="#FFFFFF"/>
${text(24, 29, "9:41", { size: 15, fill: s.dark, family: s.bodyFamily, weight: 600 })}
<rect x="318" y="17" width="22" height="11" rx="3" fill="none" stroke="${s.dark}" stroke-width="1.2"/>
<rect x="320" y="19" width="14" height="7" rx="1.5" fill="${s.dark}"/>
<rect x="346" y="21" width="3" height="4" rx="1" fill="${s.dark}"/>
<rect y="44" width="390" height="64" fill="#FFFFFF"/>
<rect y="108" width="390" height="1" fill="${s.dark}" opacity="0.12"/>
${logoImage(s, 20, 56, 150, 40, "left")}
<rect x="340" y="68" width="22" height="3" rx="1.5" fill="${s.dark}"/>
<rect x="340" y="76" width="22" height="3" rx="1.5" fill="${s.dark}"/>
<rect x="340" y="84" width="22" height="3" rx="1.5" fill="${s.dark}"/>
<rect x="20" y="132" width="350" height="200" rx="20" fill="${s.accent}" opacity="0.3"/>
${text(20, 392, clip(`Hello from ${s.name}`, 22), { size: 26, fill: s.dark, family: s.headFamily, weight: 700 })}
${text(20, 424, "Placeholder text for your app.", { size: 15, fill: s.dark, family: s.bodyFamily, opacity: 0.7 })}
<rect x="20" y="452" width="300" height="10" rx="5" fill="${s.dark}" opacity="0.12"/>
<rect x="20" y="474" width="240" height="10" rx="5" fill="${s.dark}" opacity="0.12"/>
<rect x="20" y="520" width="350" height="52" rx="26" fill="${s.main}"/>
${text(195, 553, "Get started", { size: 17, fill: s.onMain, family: s.bodyFamily, weight: 600, anchor: "middle" })}
<rect x="145" y="826" width="100" height="5" rx="2.5" fill="${s.dark}" opacity="0.6"/>`;
  return svgDoc(780, 1688, 390, 844, body);
}
