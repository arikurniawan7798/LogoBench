import express from "express";
import { Store } from "./storage.js";
import { loadConfig } from "./config.js";
import { createProvider, type Provider } from "./ai/provider.js";
import type { AppContext } from "./context.js";
import { projectService } from "./projects.js";
import { projectsRouter } from "./routes/projects.js";
import { reviewRouter } from "./routes/review.js";
import { advancedRouter } from "./routes/advanced.js";
import { formsRouter, projectBriefRouter } from "./routes/forms.js";
import { colorsRouter } from "./routes/colors.js";
import { typeRouter } from "./routes/type.js";
import { exportRouter } from "./routes/export.js";
import { mockupsRouter } from "./routes/mockups.js";
import { compareRouter } from "./routes/compare.js";
import { settingsRouter } from "./routes/settings.js";
import { identityRouter } from "./routes/identity.js";
import type { FontFetcher } from "./identity/fonts.js";
import { loadSettings } from "./settings.js";
import { errorHandler } from "./errors.js";
import { MAX_UPLOAD_BYTES, MAX_JSON_BYTES } from "./limits.js";

export function createApp(
  deps: { dataDir?: string; provider?: Provider; limits?: { uploadBytes?: number; jsonBytes?: number }; fontFetcher?: FontFetcher } = {},
) {
  const store = new Store(deps.dataDir ?? loadConfig().dataDir);
  const ctx: AppContext = {
    store,
    // Settings are re-read on every call so changes apply without a restart; an injected provider wins (tests).
    // With no key the Gemini adapter throws AiError NO_KEY before any network call.
    getProvider: async () => deps.provider ?? createProvider(await loadSettings(store)),
    projects: projectService,
    limits: { uploadBytes: deps.limits?.uploadBytes ?? MAX_UPLOAD_BYTES, jsonBytes: deps.limits?.jsonBytes ?? MAX_JSON_BYTES },
    fontFetcher: deps.fontFetcher, // undefined: downloadFont uses global fetch
  };
  const app = express();
  app.use(express.json({ limit: ctx.limits.jsonBytes }));
  app.locals.ctx = ctx;
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/projects", projectsRouter(ctx));
  app.use("/api/projects/:id/review", reviewRouter(ctx));
  app.use("/api/projects/:id/colors", colorsRouter(ctx));
  app.use("/api/projects/:id/type", typeRouter(ctx));
  app.use("/api/projects/:id", projectBriefRouter(ctx));
  app.use("/api/projects/:id", advancedRouter(ctx));
  app.use("/api", exportRouter(ctx));
  app.use("/api", mockupsRouter(ctx));
  app.use("/api", identityRouter(ctx));
  app.use("/api/forms", formsRouter(ctx));
  app.use("/api/compares", compareRouter(ctx));
  app.use("/api/settings", settingsRouter(ctx));
  app.use(errorHandler);
  return app;
}
