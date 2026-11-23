import type { AppContext } from "./context.js";

/**
 * Who wrote a project's saved palette (colors.json) or type system (type.json):
 * - "user": saved/edited through the Colors or Type tab (PUT),
 * - "ai": an AI suggestion (Suggest button or Create identity),
 * - "fallback": Create identity's deterministic, AI-free fallback.
 * Kept in a sidecar (projects/<id>/sources.json) so the saved files keep their exact shape. A saved file with no
 * recorded source predates this and is treated as "user" (never silently overwritten).
 */
export type SavedSource = "user" | "ai" | "fallback";
export type SavedPart = "colors" | "type";

const sourcesPath = (id: string) => `projects/${id}/sources.json`;
const VALID = new Set<SavedSource>(["user", "ai", "fallback"]);

export async function recordSource(ctx: AppContext, projectId: string, part: SavedPart, source: SavedSource): Promise<void> {
  const raw = await ctx.store.readJson<Record<string, unknown>>(sourcesPath(projectId)).catch(() => null);
  const current = raw && typeof raw === "object" ? raw : {};
  await ctx.store.writeJson(sourcesPath(projectId), { ...current, [part]: source });
}

/** Source of a saved file, or null when nothing is saved. Unknown/missing records read as "user". */
export async function savedSource(ctx: AppContext, projectId: string, part: SavedPart): Promise<SavedSource | null> {
  const file = `projects/${projectId}/${part}.json`;
  if ((await ctx.store.readJson<unknown>(file)) === null) return null;
  const raw = await ctx.store.readJson<Record<string, unknown>>(sourcesPath(projectId)).catch(() => null);
  const v = raw?.[part];
  return typeof v === "string" && VALID.has(v as SavedSource) ? (v as SavedSource) : "user";
}
