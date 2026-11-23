import sharp from "sharp";
import { zipSync } from "fflate";
import type { AppContext } from "../context.js";
import { getPalette } from "../colors/service.js";
import { hexToRgb } from "../colors/convert.js";
import type { BrandPalette } from "../colors/roles.js";
import { rasterizeToPng } from "../image/raster.js";
import { HttpError } from "../errors.js";
import { collectColors, monochromeSvg, recolorSvg } from "./recolor.js";
import { makeFavicons } from "./favicon.js";

const SIZES = [256, 512, 1024];
const VARIANTS = ["main", "white", "black", "on-dark", "on-light"] as const;
type Variant = (typeof VARIANTS)[number];
const SKIP_REASON = "needs an SVG source";
const RASTER_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

const lum = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

/** Palette color with the strongest contrast direction (lightest for on-dark, darkest for on-light), else a fixed fallback. */
function pickTone(palette: BrandPalette, dark: boolean): string {
  const all = [palette.main, ...palette.support, ...palette.neutral].map((s) => s.hex.toLowerCase());
  const sorted = all.sort((a, b) => lum(a) - lum(b));
  if (dark) {
    const c = sorted[sorted.length - 1];
    return c && lum(c) >= 0.6 ? c : "#ffffff";
  }
  const c = sorted[0];
  return c && lum(c) <= 0.35 ? c : "#111111";
}

function svgVariants(svg: string, palette: BrandPalette): Record<Variant, { svg: string; warnings: string[] }> {
  const colors = collectColors(svg);
  // A single-colour logo takes the brand's main colour; multi-colour logos keep their own colours.
  const main = colors.length === 1 ? recolorSvg(svg, { [colors[0]]: palette.main.hex }) : recolorSvg(svg, {});
  return {
    main,
    white: monochromeSvg(svg, "#ffffff"),
    black: monochromeSvg(svg, "#000000"),
    "on-dark": monochromeSvg(svg, pickTone(palette, true)),
    "on-light": monochromeSvg(svg, pickTone(palette, false)),
  };
}

export async function buildExportZip(
  ctx: AppContext,
  projectId: string,
  opts: { palette?: BrandPalette } = {},
): Promise<{ zip: Buffer; skipped: string[] }> {
  const { meta, bytes } = await ctx.projects.latestVersion(ctx, projectId); // 404 for unknown project
  const palette = opts.palette ?? (await getPalette(ctx, projectId));
  const isSvg = meta.mime === "image/svg+xml";
  const files: Record<string, Uint8Array> = {};
  const skipped: string[] = [];
  const add = (name: string, data: Buffer) => void (files[name] = new Uint8Array(data));
  const notes: string[] = [];

  const renders: { variant: Variant; bytes: Buffer; mime: string }[] = [];
  if (isSvg) {
    add("logo.svg", bytes);
    const vs = svgVariants(bytes.toString("utf8"), palette);
    for (const v of VARIANTS) {
      const buf = Buffer.from(vs[v].svg, "utf8");
      add(`logo-${v}.svg`, buf);
      renders.push({ variant: v, bytes: buf, mime: "image/svg+xml" });
      for (const w of vs[v].warnings) notes.push(`logo-${v}.svg: ${w}`);
    }
  } else {
    const ext = RASTER_EXT[meta.mime];
    if (!ext) throw new HttpError(422, "Unsupported logo type");
    add(`logo.${ext}`, bytes);
    renders.push({ variant: "main", bytes, mime: meta.mime });
    skipped.push(`logo.svg: ${SKIP_REASON}`);
    for (const v of VARIANTS) skipped.push(`logo-${v}.svg: ${SKIP_REASON}`);
    for (const v of VARIANTS.filter((x) => x !== "main")) skipped.push(`png/logo-${v}-{${SIZES.join(",")}}.png: ${SKIP_REASON}`);
  }

  for (const r of renders) for (const size of SIZES) add(`png/logo-${r.variant}-${size}.png`, await rasterizeToPng(r.bytes, r.mime, { maxSize: size }));

  // JPG of the main logo on a light background (JPG has no alpha).
  const main = renders.find((r) => r.variant === "main")!;
  try {
    const flat = await sharp(await rasterizeToPng(main.bytes, main.mime, { maxSize: 1024 }))
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 92 })
      .toBuffer();
    add("jpg/logo-on-light.jpg", flat);
  } catch {
    throw new HttpError(422, "Could not process image");
  }

  for (const f of await makeFavicons(bytes, meta.mime)) add(`favicons/${f.name}`, f.bytes);
  add("README.txt", Buffer.from(readme(isSvg, skipped, notes), "utf8"));

  // Entry names are all fixed ASCII literals above; nothing user-supplied reaches the archive paths.
  const zip = Buffer.from(zipSync(files, { level: 6 }));
  return { zip, skipped };
}

function readme(isSvg: boolean, skipped: string[], notes: string[]): string {
  const lines = [
    "Your logo pack",
    "==============",
    "",
    "logo.svg / logo.png / logo.jpg  Your logo as uploaded (SVG files are cleaned of scripts and external links).",
    "logo-main.svg                   Brand colour version (single-colour logos take your main brand colour).",
    "logo-white.svg, logo-black.svg  One-colour versions for stamps, engraving and print.",
    "logo-on-dark.svg                Light version for dark backgrounds.",
    "logo-on-light.svg               Dark version for light backgrounds.",
    "png/                            Transparent PNGs at 256, 512 and 1024 pixels.",
    "jpg/logo-on-light.jpg           A flat JPG on a white background.",
    "favicons/                       Website icons: favicon.ico, PNG sizes, apple-touch-icon and Android icons.",
    "",
    "Favicon snippet for your page <head>:",
    '  <link rel="icon" href="/favicon.ico" sizes="48x48">',
    '  <link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    "",
  ];
  if (!isSvg) {
    lines.push("Not included, because this logo was uploaded as a raster image:");
    for (const s of skipped) lines.push(`  - ${s}`);
    lines.push("Upload an SVG version of the logo to get the vector and recolored files.", "");
  }
  if (notes.length) {
    lines.push("Notes:");
    for (const n of notes) lines.push(`  - ${n}`);
    lines.push("");
  }
  return lines.join("\r\n");
}
