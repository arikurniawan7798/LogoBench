import crypto from "node:crypto";
import type { AppContext } from "./context.js";
import { sanitizeSvg } from "./svg.js";

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

export function sniffMime(b: Buffer): string | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  const head = b.subarray(0, 2048).toString("utf8").replace(/^﻿/, "");
  if (/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head)) return "image/svg+xml";
  return null;
}

const ID_RE = /^[A-Za-z0-9-]+$/;
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
    } catch {
      throw new UnsupportedMediaError("Invalid SVG");
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
  async list(ctx: AppContext): Promise<Project[]> {
    const ids = await ctx.store.list("projects");
    const all = await Promise.all(ids.map((id) => (ID_RE.test(id) ? ctx.store.readJson<Project>(`${dir(id)}/project.json`) : null)));
    return all.filter((p): p is Project => !!p).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async addVersion(ctx: AppContext, id: string, file: UploadFile): Promise<Project> {
    const project = await loadProject(ctx, id);
    project.versions.push(await storeVersion(ctx, id, file));
    await ctx.store.writeJson(`${dir(id)}/project.json`, project);
    return project;
  },
  async latestVersion(ctx: AppContext, id: string): Promise<{ meta: ProjectVersion; bytes: Buffer }> {
    const project = await loadProject(ctx, id);
    const meta = project.versions[project.versions.length - 1];
    if (!meta) throw new NotFoundError("Project has no versions");
    return { meta, bytes: await ctx.store.readFile(`${dir(id)}/${meta.file}`) };
  },
};

export type ProjectService = typeof projectService;
