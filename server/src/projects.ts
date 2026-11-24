import crypto from "node:crypto";
import type { AppContext } from "./context.js";
import { sanitizeSvg, scanProlog, SvgDtdError } from "./svg.js";

export type ProjectVersion = {
  id: string;
  file: string;
  mime: string;
  sha256: string;
  originalName: string;
  uploadedAt: string;
};
export type Project = { id: string; name: string; createdAt: string; versions: ProjectVersion[] };
export type UploadFile = { buffer: Buffer; originalName: string };

export class UnsupportedMediaError extends Error {}
export class NotFoundError extends Error {}

const EXT: Record<string, string> = { "image/svg+xml": "svg", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

const SNIFF_BYTES = 64 * 1024;

export function sniffMime(b: Buffer): string | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  // Walk the prolog (XML declaration, comments, a DOCTYPE with an internal subset as Illustrator writes it) within
  // the first 64 KB, then require the root element to be <svg>.
  const head = b.subarray(0, SNIFF_BYTES).toString("utf8");
  const prolog = scanProlog(head);
  if (prolog && /^<svg[\s>/]/i.test(head.slice(prolog.rootStart, prolog.rootStart + 5))) return "image/svg+xml";
  return null;
}

const ID_RE = /^[A-Za-z0-9-]+$/;

/** Project names: 1-80 characters (code points) after trimming, no control or bidi-override characters. */
export const PROJECT_NAME_MAX = 80;
export const NAME_FORBIDDEN_RE = /[\u0000-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/;
const NAME_FORBIDDEN_G = new RegExp(NAME_FORBIDDEN_RE.source, "g");

/**
 * A friendly default name from an uploaded file name: drop the extension, turn _ - . into spaces, collapse whitespace,
 * trim and cap at PROJECT_NAME_MAX. "ledgerly-logo.jpg" -> "ledgerly logo". Never empty ("Untitled logo").
 */
export function defaultNameFromFile(fileName: string): string {
  const base = (typeof fileName === "string" ? fileName : "").replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const words = base.replace(NAME_FORBIDDEN_G, " ").replace(/[_.\-]+/g, " ").replace(/\s+/g, " ").trim();
  return Array.from(words).slice(0, PROJECT_NAME_MAX).join("").trim() || "Untitled logo";
}

/** Per-project mutation queue: read-modify-write of project.json never interleaves (a rename cannot drop a new version). */
const queues = new Map<string, Promise<unknown>>();
function serialized<T>(id: string, work: () => Promise<T>): Promise<T> {
  const prev = queues.get(id) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(work);
  const tail = next.catch(() => {});
  queues.set(id, tail);
  void tail.then(() => {
    if (queues.get(id) === tail) queues.delete(id);
  });
  return next;
}

function isProject(p: unknown): p is Project {
  const o = p as Partial<Project> | null;
  return (
    !!o &&
    typeof o === "object" &&
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.createdAt === "string" &&
    Array.isArray(o.versions)
  );
}
const dir = (id: string) => `projects/${id}`;

async function loadProject(ctx: AppContext, id: string): Promise<Project> {
  if (!ID_RE.test(id)) throw new NotFoundError("Project not found");
  const p = await ctx.store.readJson<Project>(`${dir(id)}/project.json`);
  if (!p) throw new NotFoundError("Project not found");
  return p;
}

/** Shared upload validation: magic-byte sniff (415 if unsupported) and SVG sanitizing. Returns the bytes to store/use. */
export function prepareImage(buffer: Buffer): { mime: string; bytes: Buffer } {
  const mime = sniffMime(buffer);
  if (!mime) throw new UnsupportedMediaError("Unsupported file type; use SVG, PNG, JPG or WebP");
  let bytes = buffer;
  if (mime === "image/svg+xml") {
    try {
      bytes = Buffer.from(sanitizeSvg(buffer.toString("utf8")), "utf8");
    } catch (e) {
      throw new UnsupportedMediaError(e instanceof SvgDtdError ? e.message : "Invalid SVG");
    }
  }
  return { mime, bytes };
}

async function storeVersion(ctx: AppContext, projectId: string, file: UploadFile): Promise<ProjectVersion> {
  const { mime, bytes } = prepareImage(file.buffer);
  const id = ctx.store.newId();
  const name = `${id}.${EXT[mime]}`;
  await ctx.store.writeFile(`${dir(projectId)}/${name}`, bytes);
  return {
    id,
    file: name,
    mime,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    originalName: file.originalName,
    uploadedAt: new Date().toISOString(),
  };
}

export const projectService = {
  async create(ctx: AppContext, name: string, file: UploadFile): Promise<Project> {
    const id = ctx.store.newId();
    const version = await storeVersion(ctx, id, file);
    const project: Project = { id, name, createdAt: new Date().toISOString(), versions: [version] };
    await ctx.store.writeJson(`${dir(id)}/project.json`, project);
    return project;
  },
  get: (ctx: AppContext, id: string) => loadProject(ctx, id),
  /** All readable projects, oldest first. One corrupt or wrong-shaped project.json is skipped (with a warning), never fatal. */
  async list(ctx: AppContext): Promise<Project[]> {
    const ids = (await ctx.store.list("projects")).filter((id) => ID_RE.test(id));
    let skipped = 0;
    const all = await Promise.all(
      ids.map(async (id) => {
        try {
          const p = await ctx.store.readJson<unknown>(`${dir(id)}/project.json`);
          if (p === null) return null; // a folder without project.json (e.g. half-created): not a record
          if (isProject(p)) return p;
        } catch {
          /* unreadable or invalid JSON */
        }
        skipped++;
        return null;
      }),
    );
    // Count only: never echo file content (it may hold anything).
    if (skipped) console.warn(`projects: skipped ${skipped} unreadable project record(s)`);
    return all.filter((p): p is Project => !!p).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async addVersion(ctx: AppContext, id: string, file: UploadFile): Promise<Project> {
    await loadProject(ctx, id); // 404 before storing any bytes
    return serialized(id, async () => {
      const project = await loadProject(ctx, id);
      project.versions.push(await storeVersion(ctx, id, file));
      await ctx.store.writeJson(`${dir(id)}/project.json`, project);
      return project;
    });
  },
  /** Rename (the route validates the name). Atomic write via the store; NotFoundError (404) for an unknown project. */
  async rename(ctx: AppContext, id: string, name: string): Promise<Project> {
    await loadProject(ctx, id);
    return serialized(id, async () => {
      const project = await loadProject(ctx, id);
      project.name = name;
      await ctx.store.writeJson(`${dir(id)}/project.json`, project);
      return project;
    });
  },
  async latestVersion(ctx: AppContext, id: string): Promise<{ meta: ProjectVersion; bytes: Buffer }> {
    const project = await loadProject(ctx, id);
    const meta = project.versions[project.versions.length - 1];
    if (!meta) throw new NotFoundError("Project has no versions");
    return { meta, bytes: await ctx.store.readFile(`${dir(id)}/${meta.file}`) };
  },
};

export type ProjectService = typeof projectService;
