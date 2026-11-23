import sharp from "sharp";
import { HEX_RE, hexToRgb } from "../colors/convert.js";
import { defaultPalette, type BrandPalette } from "../colors/roles.js";
import { rasterizeToPng } from "../image/raster.js";
import { loadFonts, type TypeSystem } from "../type/pairings.js";
import { appiconSvg } from "./templates/appicon.svg.js";
import { businesscardSvg } from "./templates/businesscard.svg.js";
import type { Scene } from "./templates/common.js";
import { faviconSvg } from "./templates/favicon.svg.js";
import { mobileSvg } from "./templates/mobile.svg.js";
import { websiteSvg } from "./templates/website.svg.js";

export const MOCKUP_KINDS = ["website", "mobile", "appicon", "favicon", "businesscard"] as const;
export type MockupKind = (typeof MOCKUP_KINDS)[number];

/** Exact output pixel sizes. mobile is designed at 390x844 and rendered at 2x. */
export const MOCKUP_SPECS: Record<MockupKind, { width: number; height: number; label: string }> = {
  website: { width: 1280, height: 720, label: "Website header" },
  mobile: { width: 780, height: 1688, label: "Mobile screen (390x844 @2x)" },
  appicon: { width: 512, height: 512, label: "App icon" },
  favicon: { width: 600, height: 240, label: "Favicon in a browser tab" },
  businesscard: { width: 1050, height: 600, label: "Business card (front)" },
};

export const isMockupKind = (k: string): k is MockupKind => (MOCKUP_KINDS as readonly string[]).includes(k);

export type MockupInput = {
  logo: { mime: string; bytes: Buffer };
  palette: BrandPalette;
  type: TypeSystem;
  brandName: string;
};

export const BRAND_NAME_MAX = 60;
const LOGO_MAX_PX = 512;

/** Strip control/format-override/invalid-XML characters, collapse whitespace, cap length by code points. */
function cleanName(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  const cleaned = s
    .replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿￾￿]/g, " ")
    .replace(/[\uD800-\uDFFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "") // lone surrogates
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(cleaned).slice(0, BRAND_NAME_MAX).join("") || "Your Brand";
}

const lum = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** A palette hex if (and only if) it is exactly #RRGGBB, else the fallback. Policy: invalid colors fall back per color; they never fail the render. */
const safeHex = (v: unknown, fallback: string): string => (typeof v === "string" && HEX_RE.test(v) ? v.toUpperCase() : fallback);

// Mockups use GENERIC families only. librsvg resolves text through system fonts and the curated Google Fonts are not
// installed, so a named family would silently fall back to an arbitrary system face. The generic family implied by the
// font's curated category keeps output deterministic and never errors. Exact brand fonts need the font files (see Task 13).
const GENERIC: Record<string, string> = { serif: "serif", sans: "sans-serif", display: "sans-serif", script: "cursive", mono: "monospace" };
const FAMILY_RE = /^[A-Za-z0-9 ]+$/;
function genericFamily(name: unknown): string {
  if (typeof name !== "string" || name.length > 60 || !FAMILY_RE.test(name)) return "sans-serif";
  const f = loadFonts().find((x) => x.family.toLowerCase() === name.trim().toLowerCase());
  return (f && GENERIC[f.category]) || "sans-serif";
}

/** Validate/normalize all inputs into a Scene; the logo becomes a PNG data URI (user SVG is rasterized, never embedded). */
export async function prepareScene(input: MockupInput): Promise<Scene> {
  const def = defaultPalette();
  const pal = input.palette;
  const main = safeHex(pal?.main?.hex, def.main.hex);
  const accent = safeHex(pal?.support?.[0]?.hex, main);
  const neutrals = (pal?.neutral ?? []).map((s) => s?.hex).filter((h): h is string => typeof h === "string" && HEX_RE.test(h)).map((h) => h.toUpperCase());
  const byLum = [...neutrals].sort((a, b) => lum(a) - lum(b));
  const darkCand = byLum[0];
  const lightCand = byLum[byLum.length - 1];
  const dark = darkCand && lum(darkCand) < 0.2 ? darkCand : "#1F2937";
  const light = lightCand && lum(lightCand) > 0.6 ? lightCand : "#F8FAFC";

  const png = await rasterizeToPng(input.logo.bytes, input.logo.mime, { maxSize: LOGO_MAX_PX });
  const meta = await sharp(png).metadata();
  return {
    name: cleanName(input.brandName),
    main,
    onMain: lum(main) > 0.4 ? "#111111" : "#FFFFFF",
    accent,
    dark,
    light,
    headFamily: genericFamily(input.type?.heading),
    bodyFamily: genericFamily(input.type?.body),
    logo: { uri: `data:image/png;base64,${png.toString("base64")}`, w: meta.width ?? 1, h: meta.height ?? 1 },
  };
}

const TEMPLATES: Record<MockupKind, (s: Scene) => string> = {
  website: websiteSvg,
  mobile: mobileSvg,
  appicon: appiconSvg,
  favicon: faviconSvg,
  businesscard: businesscardSvg,
};

/** The SVG template string for a kind (exported for tests). */
export function buildMockupSvg(kind: MockupKind, scene: Scene): string {
  return TEMPLATES[kind](scene);
}

/** Render a mockup as PNG. Pure: no filesystem or network. Invalid logo bytes throw HttpError 422 (from rasterizeToPng). */
export async function renderMockup(kind: MockupKind, input: MockupInput): Promise<Buffer> {
  const scene = await prepareScene(input);
  const { width, height } = MOCKUP_SPECS[kind];
  return sharp(Buffer.from(buildMockupSvg(kind, scene), "utf8"), { limitInputPixels: 50_000_000 })
    .resize(width, height)
    .png()
    .toBuffer();
}
