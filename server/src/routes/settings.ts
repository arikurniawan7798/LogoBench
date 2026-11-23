import { Router } from "express";
import type { AppContext } from "../context.js";
import { loadSettings, saveSettings, publicSettings } from "../settings.js";

export function settingsRouter(ctx: AppContext): Router {
  const r = Router();
  r.get("/", async (_req, res, next) => {
    try {
      res.json(publicSettings(await loadSettings(ctx.store)));
    } catch (e) {
      next(e);
    }
  });
  r.put("/", async (req, res, next) => {
    try {
      await saveSettings(ctx.store, req.body);
      res.json(publicSettings(await loadSettings(ctx.store)));
    } catch (e) {
      next(e);
    }
  });
  return r;
}
