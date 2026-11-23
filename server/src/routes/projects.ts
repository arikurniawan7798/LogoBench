import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import type { AppContext } from "../context.js";
import { NotFoundError, UnsupportedMediaError } from "../projects.js";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function projectsRouter(ctx: AppContext): Router {
  const r = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }).single("logo");
  const handle = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);
  const fileOf = (req: Request) => {
    if (!req.file) throw Object.assign(new Error("Missing file field 'logo'"), { status: 400 });
    return { buffer: req.file.buffer, originalName: req.file.originalname };
  };

  r.get("/", handle(async (_req, res) => void res.json(await ctx.projects.list(ctx))));
  r.post("/", upload, handle(async (req, res) => {
    const file = fileOf(req);
    const name = typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim() : file.originalName;
    res.status(201).json(await ctx.projects.create(ctx, name, file));
  }));
  r.get("/:id", handle(async (req, res) => void res.json(await ctx.projects.get(ctx, req.params.id))));
  r.post("/:id/versions", upload, handle(async (req, res) => {
    res.status(201).json(await ctx.projects.addVersion(ctx, req.params.id, fileOf(req)));
  }));
  r.get("/:id/logo", handle(async (req, res) => {
    const { meta, bytes } = await ctx.projects.latestVersion(ctx, req.params.id);
    res.setHeader("Content-Type", meta.mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (meta.mime === "image/svg+xml") res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
    res.send(bytes);
  }));

  r.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      return void res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: err.message });
    }
    if (err instanceof UnsupportedMediaError) return void res.status(415).json({ error: err.message });
    if (err instanceof NotFoundError) return void res.status(404).json({ error: err.message });
    if (err?.status === 400) return void res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  });
  return r;
}
