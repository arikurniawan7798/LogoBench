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

/** POST /api/projects/:id/advanced-review (server/src/review/schema.ts advancedSchema). */
export type Priority = "high" | "medium" | "low";
export type AdvancedResult = ReviewResult & {
  fixes: { issue: string; fix: string; priority: Priority }[];
  checklist: { item: string; done: boolean }[];
  presentationIdeas: string[];
};
export type AdvancedResponse = { result: AdvancedResult; cached: boolean };

/** server/src/colors/roles.ts. cmyk is a naive conversion: approximate, not print-accurate. */
export type RGB = [number, number, number];
export type CMYK = [number, number, number, number];
export type Swatch = { hex: string; rgb: RGB; cmyk: CMYK; cmykApproximate: true; name?: string };
export type BrandPalette = { main: Swatch; support: Swatch[]; neutral: Swatch[]; rationale?: string };
/** GET/PUT /colors carry `note`; POST /colors/suggest also reports whether a saved palette was overwritten. */
export type PaletteResponse = BrandPalette & { note: string };
export type SuggestPaletteResponse = PaletteResponse & { replacedSaved: boolean };

/** server/src/type/pairings.ts TypeSystem. Sizes are plain px/rem strings. */
export const WEB_SCALE_KEYS = ["h1", "h2", "h3", "body", "small"] as const;
export const SOCIAL_SCALE_KEYS = ["postTitle", "postBody", "caption"] as const;
export type TypeSystem = {
  heading: string;
  body: string;
  accent?: string;
  scale: {
    web: Record<(typeof WEB_SCALE_KEYS)[number], string>;
    social: Record<(typeof SOCIAL_SCALE_KEYS)[number], string>;
  };
};
export type SuggestTypeResponse = { typeSystem: TypeSystem; fallbacks: string[]; replacedSaved: boolean };

/** GET /api/mockups */
export type MockupSpec = { kind: string; width: number; height: number; label: string };

/** server/src/compare/compare.ts */
export type Scores = ReviewResult["scores"];
export type Compare = {
  id: string;
  createdAt: string;
  brief: string;
  items: { projectId: string; versionId: string }[];
  result: {
    scores: Record<string, Scores>;
    recommendation: { winnerProjectId: string; reason: string };
    notes: string[];
    totals: Record<string, number>;
    promptVersion?: string;
  };
};
export type CompareSummary = { id: string; createdAt: string; projectIds: string[]; winnerProjectId: string };

/** server/src/forms.ts */
export type QuestionType = "text" | "longtext" | "choice";
export type FormQuestion = { id: string; text: string; type: QuestionType; options?: string[] };
export type FormQuestionInput = { id?: string; text: string; type: QuestionType; options?: string[] };
export type FormTemplate = { id: string; title: string; questions: FormQuestion[]; createdAt?: string };
export type FormTemplateInput = { title: string; questions: FormQuestionInput[] };
export type FilledForm = {
  id: string;
  templateId: string;
  projectId: string;
  answers: Record<string, string>;
  snapshot?: Omit<FormTemplate, "createdAt">;
  createdAt?: string;
};
/** Free-text brief cap (server MAX_BRIEF_CHARS). */
export const MAX_BRIEF_CHARS = 2000;

/** server/src/identity/workflow.ts StepEvent, streamed by POST /create-identity. */
export const IDENTITY_STEPS = ["review", "colors", "type", "mockups", "identity"] as const;
export type IdentityStep = (typeof IDENTITY_STEPS)[number];
export type StepError = { code: string; message: string };
export type StepResult = { step: IdentityStep; status: "ok" | "failed" | "skipped"; error?: StepError; note?: string };
export type StepEvent =
  | { type: "start"; step: IdentityStep }
  | ({ type: "end" } & StepResult)
  | { type: "done"; results: StepResult[] }
  | { type: "error"; error: StepError };

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

async function requestVoid(path: string, init?: RequestInit): Promise<void> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiRequestError({ code: "OFFLINE", message: "Could not reach the LogoBench server. Is it running?" });
  }
  if (!res.ok) throw await errorFrom(res);
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

  // ---- advanced review + brief ----
  runAdvancedReview: (id: string, opts: { force?: boolean } = {}) =>
    request<AdvancedResponse>(`/api/projects/${enc(id)}/advanced-review`, json("POST", opts.force ? { force: true } : {})),
  getBrief: (id: string) => request<{ text: string }>(`/api/projects/${enc(id)}/brief`),
  /** Saves the free-text part; the response is the combined brief (free text + filled forms). */
  saveBrief: (id: string, text: string) => request<{ text: string }>(`/api/projects/${enc(id)}/brief`, json("PUT", { text })),
  listFilledForms: (id: string) => request<FilledForm[]>(`/api/projects/${enc(id)}/forms`),
  fillForm: (id: string, templateId: string, answers: Record<string, string>) =>
    request<FilledForm>(`/api/projects/${enc(id)}/forms`, json("POST", { templateId, answers })),

  // ---- colors ----
  getPalette: (id: string) => request<PaletteResponse>(`/api/projects/${enc(id)}/colors`),
  savePalette: (id: string, p: BrandPalette) => request<PaletteResponse>(`/api/projects/${enc(id)}/colors`, json("PUT", p)),
  suggestPalette: (id: string) => request<SuggestPaletteResponse>(`/api/projects/${enc(id)}/colors/suggest`, json("POST", {})),

  // ---- type ----
  getType: (id: string) => request<TypeSystem>(`/api/projects/${enc(id)}/type`),
  saveType: (id: string, t: TypeSystem) => request<TypeSystem>(`/api/projects/${enc(id)}/type`, json("PUT", t)),
  suggestType: (id: string) => request<SuggestTypeResponse>(`/api/projects/${enc(id)}/type/suggest`, json("POST", {})),

  // ---- mockups ----
  listMockups: () => request<MockupSpec[]>("/api/mockups"),

  // ---- compare ----
  listCompares: () => request<CompareSummary[]>("/api/compares"),
  getCompare: (cid: string) => request<Compare>(`/api/compares/${enc(cid)}`),
  createCompare: (projectIds: string[], brief?: string) =>
    request<Compare>(
      "/api/compares",
      json("POST", { items: projectIds.map((projectId) => ({ projectId })), ...(brief && brief.trim() ? { brief: brief.trim() } : {}) }),
    ),
  deleteCompare: (cid: string) => requestVoid(`/api/compares/${enc(cid)}`, { method: "DELETE" }),

  // ---- form templates ----
  listForms: () => request<FormTemplate[]>("/api/forms"),
  createForm: (t: FormTemplateInput) => request<FormTemplate>("/api/forms", json("POST", t)),
  updateForm: (fid: string, t: FormTemplateInput) => request<FormTemplate>(`/api/forms/${enc(fid)}`, json("PUT", t)),
  deleteForm: (fid: string) => requestVoid(`/api/forms/${enc(fid)}`, { method: "DELETE" }),

  // ---- standalone tools (multipart in, binary out) ----
  makeFavicons(file: File): Promise<Blob> {
    const form = new FormData();
    form.append("logo", file);
    return requestBlob("/api/tools/favicons", { method: "POST", body: form });
  },
  makeBackground(opts: { width: number; height: number; color: string; logo?: File | null }): Promise<Blob> {
    const form = new FormData();
    form.append("width", String(opts.width));
    form.append("height", String(opts.height));
    form.append("color", opts.color);
    if (opts.logo) form.append("logo", opts.logo);
    return requestBlob("/api/tools/background", { method: "POST", body: form });
  },
};

async function requestBlob(path: string, init?: RequestInit): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiRequestError({ code: "OFFLINE", message: "Could not reach the LogoBench server. Is it running?" });
  }
  if (!res.ok) throw await errorFrom(res);
  return res.blob();
}

/** Saves a Blob through a temporary object URL, revoked right after the click has been dispatched. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Defer revocation one task so the browser has started the download.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

// ---- Create identity stream ----

/**
 * Splits buffered text into complete `data: <json>\n\n` frames. Returns parsed events and the unfinished remainder,
 * so frames split across network reads are reassembled. Malformed frames are skipped.
 */
export function parseFrames(buffer: string): { events: StepEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n?/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: StepEvent[] = [];
  for (const frame of parts) {
    const data = frame
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) continue;
    try {
      const e = JSON.parse(data) as StepEvent;
      if (e && typeof e === "object" && typeof (e as { type?: unknown }).type === "string") events.push(e);
    } catch {
      /* skip malformed frame */
    }
  }
  return { events, rest };
}

/**
 * POST /create-identity and feed each streamed step event to `onEvent`. Non-2xx answers (404, 409 "already running")
 * are plain JSON and reject as ApiRequestError. Rejects with the abort reason when `signal` aborts.
 */
export async function streamCreateIdentity(id: string, onEvent: (e: StepEvent) => void, signal?: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/projects/${enc(id)}/create-identity`, { method: "POST", signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new ApiRequestError({ code: "OFFLINE", message: "Could not reach the LogoBench server. Is it running?" });
  }
  if (!res.ok) throw await errorFrom(res);
  if (!res.body) throw new ApiRequestError({ code: "SERVER", message: "The server sent no progress stream." });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (e) {
        if (signal?.aborted) throw e;
        throw new ApiRequestError({ code: "OFFLINE", message: "Lost the connection to the LogoBench server during the run." });
      }
      if (chunk.done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(chunk.value, { stream: true });
      const { events, rest } = parseFrames(buffer);
      buffer = rest;
      for (const e of events) onEvent(e);
    }
    // A final frame without the trailing blank line still counts.
    const { events } = parseFrames(`${buffer}\n\n`);
    for (const e of events) onEvent(e);
  } finally {
    reader.releaseLock?.();
  }
}

/** Same-origin URLs for <img src> / download links. */
export const urls = {
  mockup: (id: string, kind: string, bust?: string | number) =>
    `/api/projects/${enc(id)}/mockups/${enc(kind)}.png${bust !== undefined ? `?v=${enc(String(bust))}` : ""}`,
  exportZip: (id: string) => `/api/projects/${enc(id)}/export.zip`,
  identityZip: (id: string) => `/api/projects/${enc(id)}/identity.zip`,
  reportPdf: (id: string) => `/api/projects/${enc(id)}/report.pdf`,
};

/** URL of the project's latest logo version, for <img src>. `v` busts the browser cache when a new version is uploaded. */
export function logoUrl(id: string, v?: string): string {
  return `/api/projects/${enc(id)}/logo${v ? `?v=${enc(v)}` : ""}`;
}

export const { listProjects, getProject, createProject, getReview, runReview, getSettings, saveSettings } = api;
