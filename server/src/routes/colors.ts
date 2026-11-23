import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { getPalette, hasSavedPalette, normalizePalette, savePalette, suggestPalette } from "../colors/service.js";
import { MAX_BRIEF_CHARS } from "../review/review.js";

const suggestBody = z.object({ brief: z.string().max(MAX_BRIEF_CHARS).optional() });

/** Palettes carry an explicit note: CMYK values are naive conversions, approximate and not print-accurate. */
const NOTE = "CMYK values are approximate, not print-accurate.";

export function colorsRouter(ctx: AppContext): Router {
  const r = Router({ mergeParams: true });
  const handle = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

  r.get("/", handle(async (req, res) => {
    res.json({ ...(await getPalette(ctx, req.params.id as string)), note: NOTE });
  }));
  r.put("/", handle(async (req, res) => {
    const id = req.params.id as string;
    await ctx.projects.get(ctx, id); // 404 before validation details leak
    let palette;
    try {
      palette = normalizePalette(req.body);
    } catch (e) {
      if (e instanceof z.ZodError) {
        res.status(422).json({ error: `Invalid palette: ${e.issues[0]?.path.join(".") || "body"}: ${e.issues[0]?.message ?? "invalid"}` });
        return;
      }
      throw e;
    }
    await savePalette(ctx, id, palette);
    res.json({ ...palette, note: NOTE });
  }));
  r.post("/suggest", handle(async (req, res) => {
    const parsed = suggestBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(422).json({ error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad body"}` });
      return;
    }
    const id = req.params.id as string;
    const replacedSaved = await hasSavedPalette(ctx, id); // suggest overwrites a saved/edited palette
    res.json({ ...(await suggestPalette(ctx, id, parsed.data)), replacedSaved, note: NOTE });
  }));
  return r;
}
