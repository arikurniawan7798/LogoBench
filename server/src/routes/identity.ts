import { Router, type Request, type Response, type NextFunction } from "express";
import type { AppContext } from "../context.js";
import { contentDisposition } from "../http.js";
import { HttpError } from "../errors.js";
import { buildIdentityZip } from "../identity/bundle.js";
import { isCreateIdentityRunning, runCreateIdentity, stepError, type StepEvent } from "../identity/workflow.js";

/** Mounted at /api. */
export function identityRouter(ctx: AppContext): Router {
  const r = Router();
  const handle = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

  /**
   * Streams step events as `data: <json>\n\n` lines (text/event-stream framing, read by the client with fetch, not
   * EventSource) and ends after the final {type:"done", results} event. Unknown project / busy errors are plain JSON.
   */
  r.post("/projects/:id/create-identity", handle(async (req, res) => {
    const id = req.params.id as string;
    await ctx.projects.get(ctx, id); // 404 before the stream starts
    if (isCreateIdentityRunning(ctx, id)) throw new HttpError(409, "Create identity is already running for this project.");
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const write = (e: StepEvent) => {
      if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(e)}\n\n`);
    };
    try {
      await runCreateIdentity(ctx, id, write); // emits the final "done" event itself
    } catch (e) {
      write({ type: "error", error: stepError(e) });
    }
    res.end();
  }));

  r.get("/projects/:id/identity.zip", handle(async (req, res) => {
    const id = req.params.id as string;
    const project = await ctx.projects.get(ctx, id);
    const { zip, warnings } = await buildIdentityZip(ctx, id);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", contentDisposition(project.name, "-identity.zip"));
    res.setHeader("Cache-Control", "no-store");
    if (warnings.length) res.setHeader("X-Identity-Warnings", String(warnings.length));
    res.setHeader("Content-Length", String(zip.length));
    res.end(zip);
  }));

  return r;
}
