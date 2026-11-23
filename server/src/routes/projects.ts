import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import type { AppContext } from "../context.js";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Single-file multipart parser for field `logo`, memory storage, 10MB cap (413 via the error handler). */
export const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }).single("logo");

export function projectsRouter(ctx: AppContext): Router {
  const r = Router();
  const upload = logoUpload;
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

  return r;
}
