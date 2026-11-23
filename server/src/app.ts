import express from "express";
import { Store } from "./storage.js";
import { loadConfig } from "./config.js";
import type { AppContext } from "./context.js";
import { projectService } from "./projects.js";
import { projectsRouter } from "./routes/projects.js";

export function createApp(deps: { dataDir?: string; provider?: unknown } = {}) {
  const ctx: AppContext = {
    store: new Store(deps.dataDir ?? loadConfig().dataDir),
    getProvider: () => deps.provider,
    projects: projectService,
  };
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.locals.ctx = ctx;
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/projects", projectsRouter(ctx));
  return app;
}
