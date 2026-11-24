import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { HttpError } from "../errors.js";
import { defaultNameFromFile, NAME_FORBIDDEN_RE, PROJECT_NAME_MAX } from "../projects.js";

const renameBody = z.object({
  name: z
    .string({ error: "Name must be text." })
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .refine((s) => s.length > 0, "Name cannot be empty.")
        .refine((s) => Array.from(s).length <= PROJECT_NAME_MAX, `Name must be at most ${PROJECT_NAME_MAX} characters.`)
        .refine((s) => !NAME_FORBIDDEN_RE.test(s), "Name cannot contain control characters."),
    ),
});

/** Single-file multipart parser for field `logo`, memory storage, capped at ctx.limits.uploadBytes (413 via the error handler). */
export const logoUpload = (ctx: AppContext) =>
  multer({ storage: multer.memoryStorage(), limits: { fileSize: ctx.limits.uploadBytes, files: 1 } }).single("logo");

export function projectsRouter(ctx: AppContext): Router {
  const r = Router();
  const upload = logoUpload(ctx);
  const handle = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);
  const fileOf = (req: Request) => {
    if (!req.file) throw Object.assign(new Error("Missing file field 'logo'"), { status: 400 });
    return { buffer: req.file.buffer, originalName: req.file.originalname };
  };

  r.get("/", handle(async (_req, res) => void res.json(await ctx.projects.list(ctx))));
  r.post("/", upload, handle(async (req, res) => {
    const file = fileOf(req);
    // An explicit name is kept as given (trimmed); otherwise a friendly one is derived from the file name.
    const name = typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim() : defaultNameFromFile(file.originalName);
    res.status(201).json(await ctx.projects.create(ctx, name, file));
  }));
  r.get("/:id", handle(async (req, res) => void res.json(await ctx.projects.get(ctx, req.params.id))));
  r.patch("/:id", handle(async (req, res) => {
    const parsed = renameBody.safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid name");
    res.json(await ctx.projects.rename(ctx, req.params.id as string, parsed.data.name));
  }));
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
