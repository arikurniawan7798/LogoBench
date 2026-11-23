/**
 * Typed client for the LogoBench server (server/src/routes/*). Shapes mirror the server's zod schemas and route handlers.
 *
 * The server reports errors in two shapes:
 *  - AI errors:    { error: { code, message, retryAfterSec? } }   (errors.ts, AiError branch)
 *  - other errors: { error: "message" }                           (404, 415, 413, 422, 400, 500)
 * Both are normalized to ApiError so the UI shows one banner type.
 */

export const DIMENSIONS = ["readability", "originality", "balance", "scalability", "misinterpretation"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export type DimensionScore = { score: number; reason: string };

export type Personality = {
  presence: string;
  attitude: string;
  formality: string;
  style: string;
  tone: string;
  positioning: string;
};

export type ReviewResult = {
  scores: Record<Dimension, DimensionScore>;
  personality: Personality;
  summary: string;
};

/** POST /api/projects/:id/review */
export type ReviewResponse = { result: ReviewResult; cached: boolean };
/** GET /api/projects/:id/review (always a stored review, so cached is true) */
export type StoredReviewResponse = ReviewResponse & { createdAt: string };

export type ProjectVersion = {
  id: string;
  file: string;
  mime: string;
  sha256: string;
  originalName: string;
  uploadedAt: string;
};
export type Project = { id: string; name: string; createdAt: string; versions: ProjectVersion[] };

export type Provider = "gemini" | "ollama";
/** GET/PUT /api/settings response (publicSettings: the key itself is never sent to the browser). */
export type PublicSettings = {
  provider: Provider;
  geminiModel: string;
  ollamaModel: string;
  ollamaUrl: string;
  hasGeminiKey: boolean;
};
/** PUT /api/settings body. geminiKey is deliberately omitted: the server keeps any saved/env key when it is absent. */
export type SettingsInput = Pick<PublicSettings, "provider" | "geminiModel" | "ollamaModel" | "ollamaUrl">;

/** AI error codes from server/src/ai/provider.ts, plus client-side codes for non-AI failures. */
export type ApiErrorCode =
  | "NO_KEY"
  | "BAD_KEY"
  | "RATE_LIMIT"
  | "BAD_OUTPUT"
  | "NETWORK"
  | "BAD_MODEL"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "TOO_LARGE"
  | "UNSUPPORTED_MEDIA"
  | "INVALID"
  | "SERVER"
  | "OFFLINE";

export type ApiError = { code: ApiErrorCode | string; message: string; retryAfterSec?: number; status?: number };

export class ApiRequestError extends Error implements ApiError {
  readonly code: string;
  readonly retryAfterSec?: number;
  readonly status?: number;
  constructor(e: ApiError) {
    super(e.message);
    this.name = "ApiRequestError";
    this.code = e.code;
    this.retryAfterSec = e.retryAfterSec;
    this.status = e.status;
  }
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiRequestError) return { code: e.code, message: e.message, retryAfterSec: e.retryAfterSec, status: e.status };
  return { code: "OFFLINE", message: "Could not reach the LogoBench server. Is it running?" };
}

function codeForStatus(status: number): ApiErrorCode {
  if (status === 404) return "NOT_FOUND";
  if (status === 413) return "TOO_LARGE";
  if (status === 415) return "UNSUPPORTED_MEDIA";
  if (status === 422) return "INVALID";
  if (status >= 400 && status < 500) return "BAD_REQUEST";
  return "SERVER";
}

async function errorFrom(res: Response): Promise<ApiRequestError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  const err = (body as { error?: unknown } | undefined)?.error;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const retry = typeof o.retryAfterSec === "number" ? o.retryAfterSec : Number(res.headers.get("Retry-After")) || undefined;
    return new ApiRequestError({
      code: typeof o.code === "string" ? o.code : codeForStatus(res.status),
      message: typeof o.message === "string" ? o.message : `Request failed (${res.status})`,
      retryAfterSec: retry,
      status: res.status,
    });
  }
  return new ApiRequestError({
    code: codeForStatus(res.status),
    message: typeof err === "string" && err ? err : `Request failed (${res.status})`,
    status: res.status,
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiRequestError({ code: "OFFLINE", message: "Could not reach the LogoBench server. Is it running?" });
  }
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const enc = encodeURIComponent;

export const api = {
  listProjects: () => request<Project[]>("/api/projects"),

  getProject: (id: string) => request<Project>(`/api/projects/${enc(id)}`),

  createProject(file: File, name?: string): Promise<Project> {
    const form = new FormData();
    form.append("logo", file);
    if (name && name.trim()) form.append("name", name.trim());
    return request<Project>("/api/projects", { method: "POST", body: form });
  },

  /** Latest stored review, or null when the project has none yet (server answers 404). */
  async getReview(id: string): Promise<StoredReviewResponse | null> {
    try {
      return await request<StoredReviewResponse>(`/api/projects/${enc(id)}/review`);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 404) return null;
      throw e;
    }
  },

  runReview: (id: string, opts: { force?: boolean } = {}) =>
    request<ReviewResponse>(`/api/projects/${enc(id)}/review`, json("POST", opts.force ? { force: true } : {})),

  getSettings: () => request<PublicSettings>("/api/settings"),

  saveSettings: (s: SettingsInput) => request<PublicSettings>("/api/settings", json("PUT", s)),
};

/** URL of the project's latest logo version, for <img src>. `v` busts the browser cache when a new version is uploaded. */
export function logoUrl(id: string, v?: string): string {
  return `/api/projects/${enc(id)}/logo${v ? `?v=${enc(v)}` : ""}`;
}

export const { listProjects, getProject, createProject, getReview, runReview, getSettings, saveSettings } = api;
