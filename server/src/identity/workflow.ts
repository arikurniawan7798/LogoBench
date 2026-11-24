import type { AppContext } from "../context.js";
import type { Store } from "../storage.js";
import { AiError } from "../ai/provider.js";
import { aiMessage, HttpError } from "../errors.js";
import { NotFoundError } from "../projects.js";
import { reviewLogo } from "../review/review.js";
import { hasUserPalette, savePalette, suggestPalette } from "../colors/service.js";
import { assignRoles, defaultPalette } from "../colors/roles.js";
import { extractPalette } from "../colors/extract.js";
import { savedSource } from "../provenance.js";
import { defaultTypeSystem, hasUserType, saveType, suggestTypography } from "../type/pairings.js";

const KEPT_PALETTE = "Skipped: kept your saved palette (Create identity never overwrites colors you saved).";
const KEPT_TYPE = "Skipped: kept your saved type system (Create identity never overwrites type you saved).";
import type { MockupKind } from "../mockups/render.js";
import { buildIdentityZip, renderProjectMockups } from "./bundle.js";

export const STEPS = ["review", "colors", "type", "mockups", "identity"] as const;
export type StepName = (typeof STEPS)[number];
export type StepError = { code: string; message: string };
export type StepResult = { step: StepName; status: "ok" | "failed" | "skipped"; error?: StepError; note?: string };
export type StepEvent =
  | { type: "start"; step: StepName }
  | ({ type: "end" } & StepResult)
  | { type: "done"; results: StepResult[] }
  | { type: "error"; error: StepError };

// One run per project at a time (per data store, so separate apps/tests never collide).
const running = new WeakMap<Store, Set<string>>();
const runningFor = (ctx: AppContext) => {
  let s = running.get(ctx.store);
  if (!s) running.set(ctx.store, (s = new Set()));
  return s;
};
export const isCreateIdentityRunning = (ctx: AppContext, projectId: string) => runningFor(ctx).has(projectId);

/** Client-safe {code, message}; never includes provider internals or keys. */
export function stepError(e: unknown): StepError {
  if (e instanceof AiError) return { code: e.code, message: aiMessage(e) };
  if (e instanceof HttpError) return { code: e.status === 422 ? "BAD_INPUT" : "FAILED", message: e.message };
  if (e instanceof NotFoundError) return { code: "NOT_FOUND", message: e.message };
  console.error(e);
  return { code: "INTERNAL", message: "Unexpected error in this step." };
}

/**
 * "Create identity": review -> colors -> type -> mockups -> identity, strictly one after another.
 * No retry layer here: the provider adapter already backs off on rate limits; a step that still fails is reported once.
 * A failed step is reported (with {code, message}) and the rest still run: colors and type fall back to deterministic,
 * AI-free results (extracted logo colors; the curated default pairing) unless the user already saved their own.
 * Throws only before any step starts (unknown project, or a run already in progress for this project).
 */
export async function runCreateIdentity(
  ctx: AppContext,
  projectId: string,
  emit: (e: StepEvent) => void,
): Promise<StepResult[]> {
  const active = runningFor(ctx);
  if (active.has(projectId)) throw new HttpError(409, "Create identity is already running for this project.");
  active.add(projectId); // synchronously, before any await, so concurrent callers see it
  try {
    await ctx.projects.get(ctx, projectId);
    const send = (e: StepEvent) => {
      try {
        emit(e);
      } catch {
        /* a broken listener (e.g. closed connection) never stops the workflow */
      }
    };
    let mockups: { kind: MockupKind; png: Buffer }[] | undefined;

    // Colors and type the user saved/edited are never overwritten: those steps are skipped with a note.
    // AI-suggested or fallback results from earlier runs are replaced.
    const steps: Record<StepName, () => Promise<{ note?: string; skipped?: boolean } | void>> = {
      review: async () => {
        await reviewLogo(ctx, projectId, {});
      },
      colors: async () => {
        if (await hasUserPalette(ctx, projectId)) return { skipped: true, note: KEPT_PALETTE };
        await suggestPalette(ctx, projectId);
      },
      type: async () => {
        if (await hasUserType(ctx, projectId)) return { skipped: true, note: KEPT_TYPE };
        const { fallbacks } = await suggestTypography(ctx, projectId);
        if (fallbacks.length) return { note: `Unknown font suggested for ${fallbacks.join(", ")}; picked a curated font instead.` };
      },
      mockups: async () => {
        mockups = await renderProjectMockups(ctx, projectId);
      },
      identity: async () => {
        const { warnings } = await buildIdentityZip(ctx, projectId, { mockups });
        if (warnings.length) return { note: warnings.join(" ") };
      },
    };
    const fallbacks: Partial<Record<StepName, () => Promise<string>>> = {
      colors: async () => {
        const source = await savedSource(ctx, projectId, "colors");
        if (source === "user") return "AI colors unavailable; kept your saved palette.";
        if (source === "ai") return "AI colors unavailable; kept the palette suggested earlier.";
        try {
          // Extract fresh from the latest logo (an earlier fallback palette may be from an older version).
          const { meta, bytes } = await ctx.projects.latestVersion(ctx, projectId);
          await savePalette(ctx, projectId, assignRoles(await extractPalette(bytes, meta.mime)), "fallback");
          return "AI colors unavailable; used the colors extracted from the logo.";
        } catch {
          await savePalette(ctx, projectId, defaultPalette(), "fallback");
          return "AI colors unavailable and the logo colors could not be extracted; used a neutral default palette.";
        }
      },
      type: async () => {
        const source = await savedSource(ctx, projectId, "type");
        if (source === "user") return "AI typography unavailable; kept your saved type system.";
        if (source === "ai") return "AI typography unavailable; kept the type system suggested earlier.";
        await saveType(ctx, projectId, defaultTypeSystem(), "fallback");
        return "AI typography unavailable; used the default curated pairing.";
      },
    };

    const results: StepResult[] = [];
    for (const step of STEPS) {
      send({ type: "start", step });
      let result: StepResult;
      try {
        const out = await steps[step]();
        result = { step, status: out?.skipped ? "skipped" : "ok", ...(out?.note ? { note: out.note } : {}) };
      } catch (e) {
        result = { step, status: "failed", error: stepError(e) };
        const fb = fallbacks[step];
        if (fb) {
          try {
            result.note = await fb();
          } catch (fe) {
            result.note = `Fallback failed: ${stepError(fe).message}`;
          }
        }
      }
      results.push(result);
      send({ type: "end", ...result });
    }
    send({ type: "done", results });
    return results;
  } finally {
    active.delete(projectId);
  }
}
