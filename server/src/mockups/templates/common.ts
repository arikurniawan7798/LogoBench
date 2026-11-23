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

export type TextOpts = { size: number; fill: string; family: string; weight?: number; anchor?: "start" | "middle" | "end"; opacity?: number };

/** A <text> element; content is always escaped. */
export function text(x: number, y: number, content: string, o: TextOpts): string {
  return `<text x="${n(x)}" y="${n(y)}" font-family="${o.family}" font-size="${o.size}" font-weight="${o.weight ?? 400}" fill="${o.fill}" text-anchor="${o.anchor ?? "start"}"${o.opacity !== undefined ? ` opacity="${o.opacity}"` : ""}>${esc(content)}</text>`;
}

/** Wrap template body in the root <svg>. vbW x vbH is the design space; width x height the pixel output. */
export function svgDoc(width: number, height: number, vbW: number, vbH: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${vbW} ${vbH}">${body}</svg>`;
}
