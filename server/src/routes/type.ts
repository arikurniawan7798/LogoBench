import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { getType, hasSavedType, parseTypeSystem, saveType, suggestTypography } from "../type/pairings.js";
import { MAX_BRIEF_CHARS } from "../review/review.js";

const suggestBody = z.object({ brief: z.string().max(MAX_BRIEF_CHARS).optional() });

export function typeRouter(ctx: AppContext): Router {
  const r = Router({ mergeParams: true });
  const handle = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

  r.get("/", handle(async (req, res) => {
    res.json(await getType(ctx, req.params.id as string));
  }));
  r.put("/", handle(async (req, res) => {
    const id = req.params.id as string;
    await ctx.projects.get(ctx, id); // 404 before validation details leak
    let sys;
    try {
      sys = parseTypeSystem(req.body);
    } catch (e) {
      if (e instanceof z.ZodError) {
        res.status(422).json({ error: `Invalid type system: ${e.issues[0]?.path.join(".") || "body"}: ${e.issues[0]?.message ?? "invalid"}` });
        return;
      }
      throw e;
    }
    await saveType(ctx, id, sys);
    res.json(sys);
  }));
  r.post("/suggest", handle(async (req, res) => {
    const parsed = suggestBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(422).json({ error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad body"}` });
      return;
    }
    const id = req.params.id as string;
    await ctx.projects.get(ctx, id);
    const replacedSaved = await hasSavedType(ctx, id); // suggest overwrites a saved/edited type system
    res.json({ ...(await suggestTypography(ctx, id, parsed.data)), replacedSaved });
  }));
  return r;
}
