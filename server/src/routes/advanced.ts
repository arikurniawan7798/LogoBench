import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { NotFoundError } from "../projects.js";
import { readReview } from "../review/cache.js";
import { advancedReview } from "../review/advanced.js";
import { advancedSchema } from "../review/schema.js";
import { MAX_BRIEF_CHARS } from "../review/review.js";
import { buildReportPdf } from "../report/pdf.js";

const body = z.object({ brief: z.string().max(MAX_BRIEF_CHARS).optional(), force: z.boolean().optional() });

/** ASCII-only, header-safe filename derived from the project name. */
export function safeFilename(name: string): string {
  const base = name.replace(/[^A-Za-z0-9._ -]+/g, "_").replace(/\s+/g, " ").replace(/^[ ._]+|[ ._]+$/g, "").slice(0, 60);
  return `${base || "logo"}-review.pdf`;
}

export function advancedRouter(ctx: AppContext): Router {
  const r = Router({ mergeParams: true });
  const handle = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

  r.post("/advanced-review", handle(async (req, res) => {
    const parsed = body.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(422).json({ error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad body"}` });
      return;
    }
    res.json(await advancedReview(ctx, req.params.id as string, parsed.data));
  }));

  r.get("/report.pdf", handle(async (req, res) => {
    const id = req.params.id as string;
    const project = await ctx.projects.get(ctx, id); // 404 for unknown project
    const stored = await readReview<unknown>(ctx, id, "advanced-review");
    const parsed = stored ? advancedSchema.safeParse(stored.result) : null;
    if (!parsed?.success) throw new NotFoundError("No advanced review yet for this project. Run an advanced review first.");
    const { meta, bytes } = await ctx.projects.latestVersion(ctx, id);
    const pdf = await buildReportPdf(project, parsed.data, { mime: meta.mime, bytes });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename(project.name)}"`);
    res.setHeader("Content-Length", String(pdf.length));
    res.end(pdf);
  }));
  return r;
}
