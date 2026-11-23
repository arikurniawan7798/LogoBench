import crypto from "node:crypto";
import type { AppContext } from "../context.js";
import type { ReviewResult } from "./schema.js";

export type StoredReview = { key: string; result: ReviewResult; createdAt: string };

const file = (projectId: string) => `projects/${projectId}/review.json`;
const sha = (d: crypto.BinaryLike) => crypto.createHash("sha256").update(d).digest("hex");

/** sha256(image bytes) + prompt version + model + sha256(brief). */
export function cacheKey(bytes: Buffer, promptVersion: string, model: string, brief: string): string {
  return [sha(bytes), promptVersion, model, sha(brief)].join("|");
}

export const readReview = (ctx: AppContext, projectId: string) => ctx.store.readJson<StoredReview>(file(projectId));
export const writeReview = (ctx: AppContext, projectId: string, r: StoredReview) => ctx.store.writeJson(file(projectId), r);
