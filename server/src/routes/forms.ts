import { Router, type Request, type Response, type NextFunction } from "express";
import type { AppContext } from "../context.js";
import { formService, combinedBrief } from "../forms.js";

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch(next);

/** Form templates: mounted at /api/forms. */
export function formsRouter(ctx: AppContext): Router {
  const r = Router();
  r.get("/", wrap(async (_req, res) => void res.json(await formService.listTemplates(ctx))));
  r.post("/", wrap(async (req, res) => void res.status(201).json(await formService.createTemplate(ctx, req.body ?? {}))));
  r.get("/:id", wrap(async (req, res) => void res.json(await formService.getTemplate(ctx, req.params.id as string))));
  r.put("/:id", wrap(async (req, res) => void res.json(await formService.updateTemplate(ctx, req.params.id as string, req.body ?? {}))));
  r.delete("/:id", wrap(async (req, res) => {
    await formService.deleteTemplate(ctx, req.params.id as string);
    res.status(204).end();
  }));
  return r;
}

/** Filled forms and the project brief: mounted at /api/projects/:id. */
export function projectBriefRouter(ctx: AppContext): Router {
  const r = Router({ mergeParams: true });
  r.post("/forms", wrap(async (req, res) => void res.status(201).json(await formService.fill(ctx, req.params.id as string, req.body ?? {}))));
  r.get("/forms", wrap(async (req, res) => void res.json(await formService.listFilled(ctx, req.params.id as string))));
  r.get("/brief", wrap(async (req, res) => void res.json({ text: await combinedBrief(ctx, req.params.id as string) })));
  r.put("/brief", wrap(async (req, res) => {
    await formService.setBriefText(ctx, req.params.id as string, req.body ?? {});
    res.json({ text: await combinedBrief(ctx, req.params.id as string) });
  }));
  return r;
}
