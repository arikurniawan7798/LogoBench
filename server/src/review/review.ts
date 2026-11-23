import type { z } from "zod";
import { rasterizeToPng } from "../image/raster.js";
import type { AppContext } from "../context.js";
import { cacheKey, readReview, writeReview, type ReviewKind } from "./cache.js";
import { PROMPT_VERSION, REVIEW_SYSTEM, reviewPrompt } from "./prompts.js";
import { reviewSchema, type ReviewResult } from "./schema.js";

export { PROMPT_VERSION };
import { combinedBrief } from "../forms.js";

/** MAX_BRIEF_CHARS caps the free-text brief field; MAX_COMBINED_BRIEF_CHARS (forms.ts) caps text + forms. */
export { MAX_BRIEF_CHARS, MAX_COMBINED_BRIEF_CHARS } from "../forms.js";

const inflight = new Map<string, Promise<unknown>>();
export type { ReviewResult };

/** Explicit brief if given, else the project's saved combined brief (free text + filled forms), '' if none. Always fenced as data by the prompt builders. */
export async function resolveBrief(ctx: AppContext, projectId: string, explicit?: string): Promise<string> {
  return explicit ?? (await combinedBrief(ctx, projectId));
}

export type ReviewConfig<T> = {
  kind: ReviewKind;
  promptVersion: string;
  system: string;
  prompt: (brief: string) => string;
  schema: z.ZodType<T>;
};

/** Shared engine for basic and advanced reviews: cache (zod-validated on read), in-flight dedupe, SVG rasterization. */
export async function runCachedReview<T>(
  ctx: AppContext,
  projectId: string,
  opts: { brief?: string; force?: boolean },
  cfg: ReviewConfig<T>,
): Promise<{ result: T; cached: boolean }> {
  const { meta, bytes } = await ctx.projects.latestVersion(ctx, projectId);
  const brief = await resolveBrief(ctx, projectId, opts.brief);
  const provider = await ctx.getProvider();
  const key = cacheKey(bytes, cfg.promptVersion, provider.model, brief);

  if (!opts.force) {
    const hit = await readReview<unknown>(ctx, projectId, cfg.kind);
    if (hit && hit.key === key) {
      const ok = cfg.schema.safeParse(hit.result);
      if (ok.success) return { result: ok.data, cached: true };
    }
  }

  // Simultaneous identical requests share one provider call; the entry is always cleaned up.
  const flightKey = `${cfg.kind}|${projectId}|${key}`;
  const running = inflight.get(flightKey) as Promise<T> | undefined;
  if (running) return { result: await running, cached: false };
  const p = (async () => {
    // Models can't read SVG: send a PNG rendering instead.
    const image =
      meta.mime === "image/svg+xml"
        ? { mime: "image/png", bytes: await rasterizeToPng(bytes, meta.mime) }
        : { mime: meta.mime, bytes };
    const result = await provider.generateJson({ system: cfg.system, prompt: cfg.prompt(brief), images: [image], schema: cfg.schema });
    await writeReview(ctx, projectId, { key, result, createdAt: new Date().toISOString() }, cfg.kind);
    return result;
  })();
  inflight.set(flightKey, p);
  try {
    return { result: await p, cached: false };
  } finally {
    inflight.delete(flightKey);
  }
}

export function reviewLogo(
  ctx: AppContext,
  projectId: string,
  opts: { brief?: string; force?: boolean },
): Promise<{ result: ReviewResult; cached: boolean }> {
  return runCachedReview(ctx, projectId, opts, {
    kind: "review",
    promptVersion: PROMPT_VERSION,
    system: REVIEW_SYSTEM,
    prompt: reviewPrompt,
    schema: reviewSchema,
  });
}
