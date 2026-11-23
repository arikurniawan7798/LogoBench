import sharp from "sharp";
import type { AppContext } from "../context.js";
import { cacheKey, readReview, writeReview } from "./cache.js";
import { PROMPT_VERSION, REVIEW_SYSTEM, reviewPrompt } from "./prompts.js";
import { reviewSchema, type ReviewResult } from "./schema.js";

export { PROMPT_VERSION };
export type { ReviewResult };

/** Task 7 extends this to fall back to the project's saved brief. */
export async function resolveBrief(_ctx: AppContext, _projectId: string, explicit?: string): Promise<string> {
  return explicit ?? "";
}

export async function reviewLogo(
  ctx: AppContext,
  projectId: string,
  opts: { brief?: string; force?: boolean },
): Promise<{ result: ReviewResult; cached: boolean }> {
  const { meta, bytes } = await ctx.projects.latestVersion(ctx, projectId);
  const brief = await resolveBrief(ctx, projectId, opts.brief);
  const provider = await ctx.getProvider();
  const key = cacheKey(bytes, PROMPT_VERSION, provider.model, brief);

  if (!opts.force) {
    const hit = await readReview(ctx, projectId);
    if (hit && hit.key === key) return { result: hit.result, cached: true };
  }

  // Models can't read SVG: send a PNG rendering instead.
  const image =
    meta.mime === "image/svg+xml"
      ? { mime: "image/png", bytes: await sharp(bytes, { density: 192 }).resize({ width: 1024, height: 1024, fit: "inside" }).png().toBuffer() }
      : { mime: meta.mime, bytes };

  const result = await provider.generateJson({ system: REVIEW_SYSTEM, prompt: reviewPrompt(brief), images: [image], schema: reviewSchema });
  await writeReview(ctx, projectId, { key, result, createdAt: new Date().toISOString() });
  return { result, cached: false };
}
