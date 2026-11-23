import crypto from "node:crypto";
import type { AppContext } from "../context.js";
import type { ReviewResult } from "./schema.js";

export type StoredReview<T = ReviewResult> = { key: string; result: T; createdAt: string };

export type ReviewKind = "review" | "advanced-review";
const file = (projectId: string, kind: ReviewKind) => `projects/${projectId}/${kind}.json`;
const sha = (d: crypto.BinaryLike) => crypto.createHash("sha256").update(d).digest("hex");

/** sha256(image bytes) + prompt version + model + sha256(brief). */
export function cacheKey(bytes: Buffer, promptVersion: string, model: string, brief: string): string {
  return [sha(bytes), promptVersion, model, sha(brief)].join("|");
}

export const readReview = <T = ReviewResult>(ctx: AppContext, projectId: string, kind: ReviewKind = "review") =>
  ctx.store.readJson<StoredReview<T>>(file(projectId, kind));
export const writeReview = <T = ReviewResult>(ctx: AppContext, projectId: string, r: StoredReview<T>, kind: ReviewKind = "review") =>
  ctx.store.writeJson(file(projectId, kind), r);
