import { zipSync } from "fflate";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { getRenderPalette } from "../colors/service.js";
import { getType } from "../type/pairings.js";
import { readReview } from "../review/cache.js";
import { reviewSchema } from "../review/schema.js";
import { MOCKUP_KINDS, MOCKUP_SPECS, renderMockup, type MockupKind } from "../mockups/render.js";
import { downloadFont, fontSlug, FAMILY_RE, type FontFile } from "./fonts.js";
import { buildIdentityPage, type PageFont } from "./page.js";

const LOGO_EXT: Record<string, string> = { "image/svg+xml": "svg", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const FILE_RE = /^[a-z0-9-]+\.woff2$/;

// ---- font cache: downloaded families are kept in the data dir so later exports work offline ----
const cacheDir = (family: string) => `cache/fonts/${fontSlug(family)}`;
const manifestSchema = z.array(
  z.object({ file: z.string().regex(FILE_RE), weight: z.string().regex(/^\d{3}( \d{3})?$/), style: z.enum(["normal", "italic"]), unicodeRange: z.string().optional() }),
);

async function cachedFont(ctx: AppContext, family: string): Promise<FontFile[] | null> {
  const raw = await ctx.store.readJson<unknown>(`${cacheDir(family)}/manifest.json`).catch(() => null);
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.length) return null;
  try {
    const bytes = new Map<string, Buffer>();
    for (const f of parsed.data) if (!bytes.has(f.file)) bytes.set(f.file, await ctx.store.readFile(`${cacheDir(family)}/${f.file}`));
    return parsed.data.map((f) => ({ ...f, bytes: bytes.get(f.file)! }));
  } catch {
    return null; // a missing file means a broken cache: download again
  }
}

async function storeFont(ctx: AppContext, family: string, files: FontFile[]): Promise<void> {
  const written = new Set<string>();
  for (const f of files) {
    if (written.has(f.file)) continue;
    await ctx.store.writeFile(`${cacheDir(family)}/${f.file}`, f.bytes);
    written.add(f.file);
  }
  // Manifest last: it only exists once every file it lists is on disk.
  await ctx.store.writeJson(`${cacheDir(family)}/manifest.json`, files.map(({ bytes: _b, ...meta }) => meta));
}

/** Cached font files, else a fresh download (then cached). Throws when the font cannot be obtained. */
export async function getFontFiles(ctx: AppContext, family: string): Promise<FontFile[]> {
  const hit = await cachedFont(ctx, family);
  if (hit) return hit;
  const files = await downloadFont(family, { fetcher: ctx.fontFetcher });
  await storeFont(ctx, family, files).catch(() => {}); // caching is best-effort
  return files;
}

/** Render every mockup with the project's current palette and type (pure rendering, no AI). */
export async function renderProjectMockups(ctx: AppContext, projectId: string): Promise<{ kind: MockupKind; png: Buffer }[]> {
  const project = await ctx.projects.get(ctx, projectId);
  const { meta, bytes } = await ctx.projects.latestVersion(ctx, projectId);
  const palette = await getRenderPalette(ctx, projectId);
  const type = await getType(ctx, projectId);
  const out: { kind: MockupKind; png: Buffer }[] = [];
  for (const kind of MOCKUP_KINDS) {
    out.push({ kind, png: await renderMockup(kind, { logo: { mime: meta.mime, bytes }, palette, type, brandName: project.name }) });
  }
  return out;
}

/**
 * Standalone, offline brand identity bundle: index.html + assets/logo.*, assets/mockups/*.png, assets/fonts/*.woff2.
 * Font download failures do not fail the build: the page falls back to a system font stack and the failure is listed in
 * `warnings` (shown on the page and in README.txt). Zip entry names come only from fixed literals and validated slugs.
 */
export async function buildIdentityZip(
  ctx: AppContext,
  projectId: string,
  opts: { mockups?: { kind: MockupKind; png: Buffer }[] } = {},
): Promise<{ zip: Buffer; warnings: string[] }> {
  const project = await ctx.projects.get(ctx, projectId); // 404 for unknown project
  const { meta, bytes } = await ctx.projects.latestVersion(ctx, projectId);
  const palette = await getRenderPalette(ctx, projectId);
  const type = await getType(ctx, projectId);
  const stored = await readReview(ctx, projectId).catch(() => null);
  const review = stored ? reviewSchema.safeParse(stored.result) : undefined;
  const warnings: string[] = [];
  const files: Record<string, Uint8Array> = {};
  const add = (name: string, data: Buffer) => void (files[name] = new Uint8Array(data));

  const ext = LOGO_EXT[meta.mime] ?? "png";
  add(`assets/logo.${ext}`, bytes); // stored SVGs were sanitized on upload; the page references it via <img> only

  let mockups = opts.mockups;
  if (!mockups) {
    try {
      mockups = await renderProjectMockups(ctx, projectId);
    } catch {
      mockups = [];
      warnings.push("Mockups could not be rendered for this logo.");
    }
  }
  for (const m of mockups) add(`assets/mockups/${m.kind}.png`, m.png);

  const fonts: PageFont[] = [];
  const families = [...new Set([type.heading, type.body, type.accent].filter((f): f is string => !!f && FAMILY_RE.test(f)))];
  for (const family of families) {
    try {
      const got = await getFontFiles(ctx, family);
      const faces = got.filter((f) => FILE_RE.test(f.file));
      for (const f of faces) add(`assets/fonts/${f.file}`, f.bytes);
      fonts.push({ family, faces });
    } catch {
      fonts.push({ family, faces: [] });
      warnings.push(`Font "${family}" could not be downloaded; this page uses a similar system font instead. Export again when online to bundle it.`);
    }
  }

  const html = buildIdentityPage({
    name: project.name,
    logoFile: `assets/logo.${ext}`,
    palette,
    type,
    fonts,
    mockups: mockups.map((m) => ({ file: `assets/mockups/${m.kind}.png`, label: MOCKUP_SPECS[m.kind].label })),
    review: review?.success ? review.data : undefined,
    warnings,
  });
  add("index.html", Buffer.from(html, "utf8"));
  add("README.txt", Buffer.from(readme(warnings), "utf8"));
  return { zip: Buffer.from(zipSync(files, { level: 6 })), warnings };
}

function readme(warnings: string[]): string {
  const lines = [
    "Brand identity",
    "==============",
    "",
    "Open index.html in any browser. Everything it needs is in this folder, so it works offline.",
    "",
    "index.html        One-page brand identity: logo, colors, typography, mockups and review notes.",
    "assets/logo.*     The logo: the cleaned SVG (scripts and external links removed), or the PNG/JPG/WebP unchanged.",
    "assets/mockups/   Pre-rendered mockup images (PNG).",
    "assets/fonts/     Brand fonts (WOFF2, Google Fonts, open licenses).",
    "",
  ];
  if (warnings.length) {
    lines.push("Notes:");
    for (const w of warnings) lines.push(`  - ${w}`);
    lines.push("");
  }
  return lines.join("\r\n");
}
