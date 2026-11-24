import { Router, type Request, type Response, type NextFunction } from "express";
import type { AppContext } from "../context.js";
import { HttpError } from "../errors.js";
import { getRenderPalette } from "../colors/service.js";
import { getType } from "../type/pairings.js";
import { MOCKUP_KINDS, MOCKUP_SPECS, isMockupKind, renderMockup } from "../mockups/render.js";

/** Mounted at /api. */
export function mockupsRouter(ctx: AppContext): Router {
  const r = Router();
  const handle = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

  r.get("/mockups", (_req, res) => {
    res.json(MOCKUP_KINDS.map((kind) => ({ kind, ...MOCKUP_SPECS[kind] })));
  });

  r.get("/projects/:id/mockups/:file", handle(async (req, res) => {
    const id = req.params.id as string;
    const file = req.params.file as string;
    const m = /^([a-z]+)\.png$/.exec(file);
    if (!m || !isMockupKind(m[1])) {
      throw new HttpError(404, `Unknown mockup. Available: ${MOCKUP_KINDS.map((k) => `${k}.png`).join(", ")}`);
    }
    const project = await ctx.projects.get(ctx, id); // 404 for unknown project
    const { meta, bytes } = await ctx.projects.latestVersion(ctx, id);
    // Same palette source as the identity bundle: saved if valid, else extracted from the logo (never AI).
    const palette = await getRenderPalette(ctx, id);
    const png = await renderMockup(m[1], {
      logo: { mime: meta.mime, bytes },
      palette,
      type: await getType(ctx, id),
      brandName: project.name,
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(png);
  }));

  return r;
}
