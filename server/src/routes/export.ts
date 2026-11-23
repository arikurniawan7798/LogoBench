import { Router, type Request, type Response, type NextFunction } from "express";
import { zipSync } from "fflate";
import type { AppContext } from "../context.js";
import { prepareImage } from "../projects.js";
import { contentDisposition } from "../http.js";
import { HttpError } from "../errors.js";
import { buildExportZip } from "../export/package.js";
import { makeFavicons } from "../export/favicon.js";
import { makeBackground } from "../export/background.js";
import { logoUpload } from "./projects.js";

const asInt = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" && /^\d{1,6}$/.test(v.trim()) ? Number(v) : NaN);

/** Mounted at /api: project export plus the standalone favicon/background tools. */
export function exportRouter(ctx: AppContext): Router {
  const r = Router();
  const handle = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

  r.get("/projects/:id/export.zip", handle(async (req, res) => {
    const id = req.params.id as string;
    const project = await ctx.projects.get(ctx, id);
    const { zip, skipped } = await buildExportZip(ctx, id, {});
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", contentDisposition(project.name, "-logo-pack.zip"));
    if (skipped.length) res.setHeader("X-Export-Skipped", skipped.join("; ")); // ASCII literals only
    res.setHeader("Content-Length", String(zip.length));
    res.end(zip);
  }));

  r.post("/tools/favicons", logoUpload(ctx), handle(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Missing file field 'logo'");
    const { mime, bytes } = prepareImage(req.file.buffer);
    const files: Record<string, Uint8Array> = {};
    for (const f of await makeFavicons(bytes, mime)) files[f.name] = new Uint8Array(f.bytes);
    const zip = Buffer.from(zipSync(files));
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="favicons.zip"');
    res.setHeader("Content-Length", String(zip.length));
    res.end(zip);
  }));

  r.post("/tools/background", logoUpload(ctx), handle(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const logo = req.file ? prepareImage(req.file.buffer) : undefined;
    const png = await makeBackground({ width: asInt(b.width), height: asInt(b.height), color: String(b.color ?? ""), logo });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", 'attachment; filename="background.png"');
    res.send(png);
  }));

  return r;
}
