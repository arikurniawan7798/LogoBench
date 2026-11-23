import express from "express";
import { Store } from "./storage.js";
import { loadConfig, DEFAULT_GEMINI_MODEL, DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL } from "./config.js";
import { createProvider, type Provider } from "./ai/provider.js";
import type { AppContext } from "./context.js";
import { projectService } from "./projects.js";
import { projectsRouter } from "./routes/projects.js";

export function createApp(deps: { dataDir?: string; provider?: Provider } = {}) {
  const ctx: AppContext = {
    store: new Store(deps.dataDir ?? loadConfig().dataDir),
    getProvider: () =>
      deps.provider ??
      // Built lazily per call; with no key the Gemini adapter throws AiError NO_KEY before any network call.
      createProvider({
        provider: "gemini",
        geminiModel: DEFAULT_GEMINI_MODEL,
        ollamaModel: DEFAULT_OLLAMA_MODEL,
        ollamaUrl: DEFAULT_OLLAMA_URL,
        geminiKey: loadConfig().geminiKey,
      }),
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
