import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FakeProvider } from "../../src/ai/fake.js";
import type { AppContext } from "../../src/context.js";
import { MAX_JSON_BYTES, MAX_UPLOAD_BYTES } from "../../src/limits.js";
import { projectService } from "../../src/projects.js";
import { Store } from "../../src/storage.js";
import { reviewLogo } from "../../src/review/review.js";
import { advancedReview } from "../../src/review/advanced.js";
import { suggestPalette } from "../../src/colors/service.js";
import { assignRoles } from "../../src/colors/roles.js";
import { extractPalette } from "../../src/colors/extract.js";
import { colorDistance, hexToRgb, rgbToHsl } from "../../src/colors/convert.js";
import { suggestTypography } from "../../src/type/pairings.js";
import { formService } from "../../src/forms.js";
import { createCompare } from "../../src/compare/compare.js";
import { BRANDS, COMPARE, FORM_ANSWERS, FORM_TEMPLATE, HALDEN, HALDEN_BEAN, type DemoBrand } from "./content.js";

const LOGO_DIR = fileURLToPath(new URL("./logos/", import.meta.url));

/** Top-level entries a LogoBench data directory can contain; `--force` only ever deletes these. */
export const DATA_ENTRIES = new Set(["projects", "forms", "compares", "cache", "settings.json"]);

export class SeedRefusedError extends Error {}

export type SeedOptions = {
  dataDir: string;
  /** Replace an existing, non-empty LogoBench data directory. */
  force?: boolean;
  /** Directories that must never be seeded into, even with force (the CLI passes the real data/ dir). */
  protectedDirs?: string[];
  log?: (line: string) => void;
};
export type SeedResult = { dataDir: string; projects: { id: string; name: string; versions: number }[]; forms: number; compares: number };

async function prepareTarget(dir: string, opts: SeedOptions): Promise<void> {
  for (const p of opts.protectedDirs ?? []) {
    if (path.resolve(p) === dir) throw new SeedRefusedError(`Refusing to seed ${dir}: that is your real data directory. Use the default (data-demo/) or --dir.`);
  }
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (e: any) {
    if (e?.code === "ENOENT") return;
    throw e;
  }
  if (entries.length === 0) return;
  if (!opts.force) throw new SeedRefusedError(`${dir} is not empty. Re-run with --force to replace the demo data in it.`);
  const unknown = entries.filter((e) => !DATA_ENTRIES.has(e));
  if (unknown.length) {
    throw new SeedRefusedError(
      `Refusing to clear ${dir}: it contains ${unknown.slice(0, 3).join(", ")}${unknown.length > 3 ? ", ..." : ""}, which is not LogoBench data.`,
    );
  }
  for (const e of entries) await fs.rm(path.join(dir, e), { recursive: true, force: true });
}

/** Name each extracted swatch after the nearest designed color, or a light/dark neutral name. */
export function colorAnswer(brand: DemoBrand, candidates: string[]) {
  const swatches = candidates.map((hex) => {
    const rgb = hexToRgb(hex);
    const near = brand.colors
      .map((c) => ({ c, dist: colorDistance(rgb, hexToRgb(c.hex)) }))
      .sort((a, b) => a.dist - b.dist)[0];
    const name = near && near.dist < 45 ? near.c.name : rgbToHsl(rgb)[2] < 0.5 ? brand.neutralNames[0] : brand.neutralNames[1];
    return { hex, name };
  });
  // Propose the extracted color nearest the designed main color.
  const main = candidates.map((hex) => ({ hex, dist: colorDistance(hexToRgb(hex), hexToRgb(brand.main)) })).sort((a, b) => a.dist - b.dist)[0]?.hex;
  return { main, swatches, summary: brand.paletteSummary };
}

/**
 * Creates the demo projects in `dataDir` by driving the real services (uploads, reviews, palettes, type, forms, compare)
 * with a FakeProvider that returns canned answers. No network: the fake provider never leaves the process, and mockups
 * and identity bundles (which may fetch fonts) are left to be rendered on demand by the app.
 */
export async function seedDemo(opts: SeedOptions): Promise<SeedResult> {
  const dataDir = path.resolve(opts.dataDir);
  const log = opts.log ?? (() => {});
  await prepareTarget(dataDir, opts);

  const provider = new FakeProvider();
  const ctx: AppContext = {
    store: new Store(dataDir),
    getProvider: async () => provider,
    projects: projectService,
    limits: { uploadBytes: MAX_UPLOAD_BYTES, jsonBytes: MAX_JSON_BYTES },
  };
  const readLogo = (file: string) => fs.readFile(path.join(LOGO_DIR, file));

  const template = await formService.createTemplate(ctx, FORM_TEMPLATE);
  const ids = new Map<DemoBrand, string>();
  const result: SeedResult = { dataDir, projects: [], forms: 1, compares: 0 };

  for (const brand of BRANDS) {
    const [first, ...later] = brand.logos;
    let project = await projectService.create(ctx, brand.name, { buffer: await readLogo(first!), originalName: first! });
    for (const file of later) project = await projectService.addVersion(ctx, project.id, { buffer: await readLogo(file), originalName: file });
    const id = project.id;
    ids.set(brand, id);
    await formService.setBriefText(ctx, id, { text: brand.brief });
    if (brand === HALDEN) {
      const answers = Object.fromEntries(template.questions.map((q, i) => [q.id, FORM_ANSWERS[i] ?? ""]));
      await formService.fill(ctx, id, { templateId: template.id, answers });
    }

    provider.enqueue(brand.review);
    await reviewLogo(ctx, id, {});
    if (brand.advanced) {
      provider.enqueue({ ...brand.review, ...brand.advanced });
      await advancedReview(ctx, id, {});
    }

    const { meta, bytes } = await projectService.latestVersion(ctx, id);
    const base = assignRoles(await extractPalette(bytes, meta.mime));
    provider.enqueue(colorAnswer(brand, [base.main, ...base.support, ...base.neutral].map((s) => s.hex)));
    await suggestPalette(ctx, id);

    provider.enqueue(brand.type);
    const { fallbacks } = await suggestTypography(ctx, id);
    if (fallbacks.length) throw new Error(`demo font for ${brand.name} is not in the curated list: ${fallbacks.join(", ")}`);

    result.projects.push({ id, name: brand.name, versions: project.versions.length });
    log(`  ${brand.name} (${project.versions.length} version${project.versions.length > 1 ? "s" : ""})`);
  }

  provider.enqueue(COMPARE);
  await createCompare(ctx, { items: [{ projectId: ids.get(HALDEN)! }, { projectId: ids.get(HALDEN_BEAN)! }], brief: HALDEN.brief });
  result.compares = 1;
  return result;
}
