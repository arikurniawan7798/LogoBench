import type { AppContext } from "../context.js";
import { runCachedReview } from "./review.js";
import { ADVANCED_PROMPT_VERSION, ADVANCED_SYSTEM, advancedPrompt } from "./prompts.js";
import { advancedSchema, type AdvancedReview } from "./schema.js";

export type { AdvancedReview };

export function advancedReview(
  ctx: AppContext,
  projectId: string,
  opts: { brief?: string; force?: boolean },
): Promise<{ result: AdvancedReview; cached: boolean }> {
  return runCachedReview(ctx, projectId, opts, {
    kind: "advanced-review",
    promptVersion: ADVANCED_PROMPT_VERSION,
    system: ADVANCED_SYSTEM,
    prompt: advancedPrompt,
    schema: advancedSchema,
  });
}
