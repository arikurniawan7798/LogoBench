import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import type { AppContext } from "../context.js";
import { NotFoundError } from "../projects.js";
import { contentDisposition } from "../http.js";
import { readReview } from "../review/cache.js";
import { advancedReview } from "../review/advanced.js";
import { advancedSchema } from "../review/schema.js";
import { MAX_BRIEF_CHARS } from "../review/review.js";
import { buildReportPdf } from "../report/pdf.js";

const body = z.object({ brief: z.string().max(MAX_BRIEF_CHARS).optional(), force: z.boolean().optional() });

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
    // The stored key starts with sha256(image bytes): refuse a report for a different logo version.
    if (stored!.key.split("|")[0] !== crypto.createHash("sha256").update(bytes).digest("hex"))
      throw new NotFoundError("Advanced review is out of date for the current logo. Re-run the advanced review.");
    const pdf = await buildReportPdf(project, parsed.data, { mime: meta.mime, bytes }, { createdAt: stored!.createdAt });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", contentDisposition(project.name, "-review.pdf"));
    res.setHeader("Content-Length", String(pdf.length));
    res.end(pdf);
  }));
  return r;
}
