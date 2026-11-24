import crypto from "node:crypto";
import type { AppContext } from "../context.js";
import type { ReviewResult } from "./schema.js";

export type StoredReview<T = ReviewResult> = { key: string; result: T; createdAt: string };

export type ReviewKind = "review" | "advanced-review";
const file = (projectId: string, kind: ReviewKind) => `projects/${projectId}/${kind}.json`;
const sha = (d: crypto.BinaryLike) => crypto.createHash("sha256").update(d).digest("hex");

/** sha256(image bytes) + prompt version + provider name + model + sha256(brief). The provider is part of the key so the
 * same model name served by Gemini and by Ollama never shares a cached result. */
export function cacheKey(bytes: Buffer, promptVersion: string, providerName: string, model: string, brief: string): string {
  return [sha(bytes), promptVersion, providerName, model, sha(brief)].join("|");
}

export const readReview = <T = ReviewResult>(ctx: AppContext, projectId: string, kind: ReviewKind = "review") =>
  ctx.store.readJson<StoredReview<T>>(file(projectId, kind));
export const writeReview = <T = ReviewResult>(ctx: AppContext, projectId: string, r: StoredReview<T>, kind: ReviewKind = "review") =>
  ctx.store.writeJson(file(projectId, kind), r);

/** True when the stored review was made for exactly these image bytes (the cache key starts with sha256(image bytes)). */
export const isForBytes = (stored: { key: string }, bytes: Buffer): boolean => stored.key.split("|")[0] === sha(bytes);
