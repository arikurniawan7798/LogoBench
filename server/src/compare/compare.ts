import { z } from "zod";
import type { AppContext } from "../context.js";
import { HttpError } from "../errors.js";
import { rasterizeToPng } from "../image/raster.js";
import { NotFoundError } from "../projects.js";
import { DIMENSIONS, reviewSchema, type ReviewResult } from "../review/schema.js";
import { REVIEW_SYSTEM, fenceBrief } from "../review/prompts.js";
import { MAX_BRIEF_CHARS } from "../review/review.js";

export const COMPARE_PROMPT_VERSION = "compare-v1";
export const MIN_ITEMS = 2;
export const MAX_ITEMS = 3;

type Scores = ReviewResult["scores"];
export type Compare = {
  id: string;
  createdAt: string;
  /** Explicit brief only (empty when omitted); project briefs are NOT merged in. */
  brief: string;
  items: { projectId: string; versionId: string }[];
  result: {
    scores: Record<string, Scores>;
    recommendation: { winnerProjectId: string; reason: string };
    notes: string[];
    /** Sum of the five dimension scores per project, computed server-side. */
    totals: Record<string, number>;
    promptVersion: string;
  };
};
export type CompareSummary = { id: string; createdAt: string; projectIds: string[]; winnerProjectId: string };

const ID_RE = /^[A-Za-z0-9-]+$/;
const path = (id: string) => `compares/${id}.json`;
const LABELS = ["A", "B", "C"];

export const COMPARE_SYSTEM = [
  REVIEW_SYSTEM.replace("giving feedback on a single logo image", "comparing several logo concepts, shown as separate images")
    .replace("Respond with JSON only.", "")
    .trimEnd(),
  "The images are labelled A, B, C in the order they are attached (A is the first image). Refer to concepts only by these labels.",
  "Score every concept on the five dimensions, using the same 1 to 10 integer scale, each with a one-sentence reason.",
  "Then name the single best concept as winner (one of the labels), with a short reason (at most 600 characters) that may weigh the brief, and up to 8 short notes comparing the concepts.",
  'Respond with JSON only, shaped as {"scores": {"<label>": {readability, originality, balance, scalability, misinterpretation}}, "winner": "<label>", "reason": "...", "notes": ["..."]}.',
].join("\n");

export function comparePrompt(labels: string[], brief: string): string {
  const list = labels.map((l) => `Image ${l}`).join(", ");
  return `Compare the attached logo concepts (in order: ${list}). ${fenceBrief(brief)}`;
}

/** Output schema for exactly these labels: no missing/extra labels, winner must be one of them. */
export function compareSchema(labels: string[]) {
  return z.object({
    scores: z.object(Object.fromEntries(labels.map((l) => [l, reviewSchema.shape.scores]))).strict(),
    winner: z.enum(labels as [string, ...string[]]),
    reason: z.string().trim().min(1).max(600),
    notes: z.array(z.string().max(300)).max(8),
  });
}

export const compareBody = z.object({
  items: z.array(z.object({ projectId: z.string().min(1) })),
  brief: z.string().max(MAX_BRIEF_CHARS).optional(),
});

const inflight = new Map<string, Promise<Compare>>();

export async function createCompare(
  ctx: AppContext,
  input: { items: { projectId: string }[]; brief?: string },
): Promise<Compare> {
  const { items: reqItems } = input;
  const brief = input.brief ?? "";
  if (reqItems.length < MIN_ITEMS || reqItems.length > MAX_ITEMS) {
    throw new HttpError(422, `Compare needs ${MIN_ITEMS} to ${MAX_ITEMS} concepts`);
  }
  if (brief.length > MAX_BRIEF_CHARS) throw new HttpError(422, `Brief is too long (max ${MAX_BRIEF_CHARS} characters)`);
  if (new Set(reqItems.map((i) => i.projectId)).size !== reqItems.length) {
    throw new HttpError(422, "Each concept must be a different project");
  }

  // Resolve every project to its latest version now (404 for unknown) and pin the versionId.
  const resolved = [];
  for (const { projectId } of reqItems) {
    const { meta, bytes } = await ctx.projects.latestVersion(ctx, projectId);
    resolved.push({ projectId, meta, bytes });
  }
  const items = resolved.map((r) => ({ projectId: r.projectId, versionId: r.meta.id }));

  const flightKey = JSON.stringify([items, brief]);
  const running = inflight.get(flightKey);
  if (running) return running;
  const p = run(ctx, resolved, items, brief);
  inflight.set(flightKey, p);
  try {
    return await p;
  } finally {
    inflight.delete(flightKey);
  }
}

async function run(
  ctx: AppContext,
  resolved: { projectId: string; meta: { mime: string }; bytes: Buffer }[],
  items: Compare["items"],
  brief: string,
): Promise<Compare> {
  const provider = await ctx.getProvider();
  const labels = LABELS.slice(0, resolved.length);
  // Models can't read SVG: send PNG renderings. All images go in one call, in label order.
  const images = await Promise.all(
    resolved.map(async (r) =>
      r.meta.mime === "image/svg+xml"
        ? { mime: "image/png", bytes: await rasterizeToPng(r.bytes, r.meta.mime) }
        : { mime: r.meta.mime, bytes: r.bytes },
    ),
  );
  const out = await provider.generateJson({
    system: COMPARE_SYSTEM,
    prompt: comparePrompt(labels, brief),
    images,
    schema: compareSchema(labels),
  });

  const scores: Record<string, Scores> = {};
  const totals: Record<string, number> = {};
  labels.forEach((l, i) => {
    const s = (out.scores as Record<string, Scores>)[l]!;
    scores[items[i]!.projectId] = s;
    totals[items[i]!.projectId] = DIMENSIONS.reduce((sum, d) => sum + s[d].score, 0);
  });
  const compare: Compare = {
    id: ctx.store.newId(),
    createdAt: new Date().toISOString(),
    brief,
    items,
    result: {
      scores,
      recommendation: { winnerProjectId: items[labels.indexOf(out.winner)]!.projectId, reason: out.reason },
      notes: out.notes,
      totals,
      promptVersion: COMPARE_PROMPT_VERSION,
    },
  };
  await ctx.store.writeJson(path(compare.id), compare);
  return compare;
}

export async function getCompare(ctx: AppContext, id: string): Promise<Compare> {
  const c = ID_RE.test(id) ? await ctx.store.readJson<Compare>(path(id)) : null;
  if (!c) throw new NotFoundError("Compare not found");
  return c;
}

export async function listCompares(ctx: AppContext): Promise<CompareSummary[]> {
  const files = await ctx.store.list("compares");
  const all = await Promise.all(
    files.filter((f) => f.endsWith(".json")).map((f) => ctx.store.readJson<Compare>(`compares/${f}`)),
  );
  return all
    .filter((c): c is Compare => !!c)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      projectIds: c.items.map((i) => i.projectId),
      winnerProjectId: c.result.recommendation.winnerProjectId,
    }));
}

export async function deleteCompare(ctx: AppContext, id: string): Promise<void> {
  if (!ID_RE.test(id) || !(await ctx.store.remove(path(id)))) throw new NotFoundError("Compare not found");
}
