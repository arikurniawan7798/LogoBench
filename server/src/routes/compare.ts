import { Router, type Request, type Response, type NextFunction } from "express";
import type { AppContext } from "../context.js";
import { compareBody, createCompare, deleteCompare, getCompare, listCompares } from "../compare/compare.js";

export function compareRouter(ctx: AppContext): Router {
  const r = Router();
  const handle = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

  r.post("/", handle(async (req, res) => {
    const parsed = compareBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(422).json({ error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad body"}` });
      return;
    }
    res.status(201).json(await createCompare(ctx, parsed.data));
  }));
  r.get("/", handle(async (_req, res) => {
    res.json(await listCompares(ctx));
  }));
  r.get("/:id", handle(async (req, res) => {
    res.json(await getCompare(ctx, req.params.id as string));
  }));
  r.delete("/:id", handle(async (req, res) => {
    await deleteCompare(ctx, req.params.id as string);
    res.status(204).end();
  }));
  return r;
}
