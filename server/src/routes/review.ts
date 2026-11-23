import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { NotFoundError } from "../projects.js";
import { readReview } from "../review/cache.js";
import { reviewLogo, MAX_BRIEF_CHARS } from "../review/review.js";

const body = z.object({ brief: z.string().max(MAX_BRIEF_CHARS).optional(), force: z.boolean().optional() });

export function reviewRouter(ctx: AppContext): Router {
  const r = Router({ mergeParams: true });
  const handle = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

  r.post("/", handle(async (req, res) => {
    const parsed = body.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(422).json({ error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad body"}` });
      return;
    }
    res.json(await reviewLogo(ctx, req.params.id as string, parsed.data));
  }));
  r.get("/", handle(async (req, res) => {
    const id = req.params.id as string;
    await ctx.projects.get(ctx, id); // 404 for unknown project
    const stored = await readReview(ctx, id);
    if (!stored) throw new NotFoundError("No review yet for this project. Run a review first.");
    res.json({ result: stored.result, cached: true, createdAt: stored.createdAt });
  }));
  return r;
}
