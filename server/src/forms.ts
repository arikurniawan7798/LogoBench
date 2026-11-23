import { z } from "zod";
import type { AppContext } from "./context.js";
import { NotFoundError } from "./projects.js";
import { HttpError } from "./errors.js";

/** Cap for the project's free-text brief field only (also the cap on an explicit review `brief`). */
export const MAX_BRIEF_CHARS = 2000;
/** Cap for the COMBINED brief (free text + all filled forms) returned by the API and used in prompts. */
export const MAX_COMBINED_BRIEF_CHARS = 4000;
export const TRUNCATED_MARKER = "[truncated]";

export type QuestionType = "text" | "longtext" | "choice";
export type FormQuestion = { id: string; text: string; type: QuestionType; options?: string[] };
export type FormTemplate = { id: string; title: string; questions: FormQuestion[]; createdAt?: string };
/** `snapshot` is a copy of the template at fill time, so the form survives template edits and deletion. */
export type FilledForm = {
  id: string;
  templateId: string;
  projectId: string;
  answers: Record<string, string>;
  snapshot?: FormTemplate;
  createdAt?: string;
};

const ID_RE = /^[A-Za-z0-9-]+$/;
const QID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ANSWER_MAX: Record<QuestionType, number> = { text: 300, longtext: 2000, choice: 300 };

const questionSchema = z
  .object({
    id: z.string().regex(QID_RE, "question id must be 1-64 letters, digits, - or _").optional(),
    text: z.string().trim().min(1, "question text is required").max(300, "question text is too long (max 300)"),
    type: z.enum(["text", "longtext", "choice"]),
    options: z.array(z.string().trim().min(1, "options must not be empty").max(100, "option is too long (max 100)")).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.type === "choice") {
      if (!q.options || q.options.length < 2 || q.options.length > 10)
        ctx.addIssue({ code: "custom", message: "choice questions need 2-10 options" });
    } else if (q.options !== undefined) {
      ctx.addIssue({ code: "custom", message: "only choice questions may have options" });
    }
  });

const templateSchema = z
  .object({
    title: z.string().trim().min(1, "title is required").max(120, "title is too long (max 120)"),
    questions: z.array(questionSchema).max(30, "at most 30 questions"),
  })
  .superRefine((t, ctx) => {
    const ids = t.questions.map((q) => q.id).filter((i): i is string => !!i);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "question ids must be unique" });
  });

const fillSchema = z.object({ templateId: z.string(), answers: z.record(z.string(), z.string()) });
export const briefTextSchema = z.object({ text: z.string().max(MAX_BRIEF_CHARS, `brief is too long (max ${MAX_BRIEF_CHARS})`) });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new HttpError(422, `Invalid request: ${i?.message ?? "bad body"}`);
  }
  return r.data;
}

function checkId(id: string, what: string): void {
  if (!ID_RE.test(id)) throw new NotFoundError(`${what} not found`);
}

const tplPath = (id: string) => `forms/${id}.json`;
const projDir = (id: string) => `projects/${id}`;

async function loadTemplate(ctx: AppContext, id: string): Promise<FormTemplate> {
  checkId(id, "Form template");
  const t = await ctx.store.readJson<FormTemplate>(tplPath(id));
  if (!t) throw new NotFoundError("Form template not found");
  return t;
}

function buildQuestions(input: z.infer<typeof templateSchema>, ctx: AppContext): FormQuestion[] {
  return input.questions.map((q) => ({
    id: q.id ?? ctx.store.newId(),
    text: q.text,
    type: q.type,
    ...(q.type === "choice" ? { options: q.options } : {}),
  }));
}

export const formService = {
  async createTemplate(ctx: AppContext, body: unknown): Promise<FormTemplate> {
    const input = parse(templateSchema, body);
    const t: FormTemplate = {
      id: ctx.store.newId(),
      title: input.title,
      questions: buildQuestions(input, ctx),
      createdAt: new Date().toISOString(),
    };
    await ctx.store.writeJson(tplPath(t.id), t);
    return t;
  },
  getTemplate: loadTemplate,
  async listTemplates(ctx: AppContext): Promise<FormTemplate[]> {
    const names = await ctx.store.list("forms");
    const all = await Promise.all(
      names.filter((n) => n.endsWith(".json") && ID_RE.test(n.slice(0, -5))).map((n) => ctx.store.readJson<FormTemplate>(`forms/${n}`)),
    );
    return all.filter((t): t is FormTemplate => !!t).sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  },
  async updateTemplate(ctx: AppContext, id: string, body: unknown): Promise<FormTemplate> {
    const existing = await loadTemplate(ctx, id);
    const input = parse(templateSchema, body);
    const t: FormTemplate = { ...existing, title: input.title, questions: buildQuestions(input, ctx) };
    await ctx.store.writeJson(tplPath(id), t);
    return t;
  },
  /** Filled forms keep their own snapshot, so deleting a template never breaks projects. */
  async deleteTemplate(ctx: AppContext, id: string): Promise<void> {
    checkId(id, "Form template");
    if (!(await ctx.store.remove(tplPath(id)))) throw new NotFoundError("Form template not found");
  },

  async fill(ctx: AppContext, projectId: string, body: unknown): Promise<FilledForm> {
    await ctx.projects.get(ctx, projectId); // 404 for unknown project
    const input = parse(fillSchema, body);
    const t = await loadTemplate(ctx, input.templateId);
    const byId = new Map(t.questions.map((q) => [q.id, q]));
    const answers: Record<string, string> = {};
    for (const [qid, a] of Object.entries(input.answers)) {
      const q = byId.get(qid);
      if (!q) throw new HttpError(422, "Invalid request: answer for an unknown question");
      if (a.length > ANSWER_MAX[q.type]) throw new HttpError(422, `Invalid request: answer to "${q.text.slice(0, 40)}" is too long (max ${ANSWER_MAX[q.type]})`);
      if (q.type === "choice" && a.trim() !== "" && !q.options?.includes(a))
        throw new HttpError(422, `Invalid request: answer to "${q.text.slice(0, 40)}" must be one of the options`);
      answers[qid] = a;
    }
    const f: FilledForm = {
      id: ctx.store.newId(),
      templateId: t.id,
      projectId,
      answers,
      snapshot: { id: t.id, title: t.title, questions: t.questions },
      createdAt: new Date().toISOString(),
    };
    await ctx.store.writeJson(`${projDir(projectId)}/forms/${f.id}.json`, f);
    return f;
  },
  async listFilled(ctx: AppContext, projectId: string): Promise<FilledForm[]> {
    await ctx.projects.get(ctx, projectId);
    const names = await ctx.store.list(`${projDir(projectId)}/forms`);
    const all = await Promise.all(
      names.filter((n) => n.endsWith(".json") && ID_RE.test(n.slice(0, -5))).map((n) => ctx.store.readJson<FilledForm>(`${projDir(projectId)}/forms/${n}`)),
    );
    return all.filter((f): f is FilledForm => !!f).sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  },

  async getBriefText(ctx: AppContext, projectId: string): Promise<string> {
    await ctx.projects.get(ctx, projectId);
    return (await ctx.store.readJson<{ text?: string }>(`${projDir(projectId)}/brief.json`))?.text ?? "";
  },
  async setBriefText(ctx: AppContext, projectId: string, body: unknown): Promise<{ text: string }> {
    await ctx.projects.get(ctx, projectId);
    const { text } = parse(briefTextSchema, body);
    await ctx.store.writeJson(`${projDir(projectId)}/brief.json`, { text });
    return { text };
  },
};

/** Collapse all whitespace (incl. newlines) so user data stays on one line and cannot forge another line. */
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

function answerLines(t: FormTemplate, f: FilledForm): string[] {
  const out: string[] = [];
  for (const q of t.questions) {
    const a = Object.hasOwn(f.answers, q.id) ? f.answers[q.id] : undefined;
    if (typeof a !== "string" || !a.trim()) continue;
    out.push(`- ${oneLine(q.text)}: ${oneLine(a)}`);
  }
  return out;
}

/** Plain-text brief for one filled form: one "- question: answer" line per answered question (blank/unknown skipped). */
export function briefFromForm(t: FormTemplate, f: FilledForm): string {
  return answerLines(t, f).join("\n");
}

/**
 * The project's free-text brief plus every filled form, capped at MAX_COMBINED_BRIEF_CHARS by dropping whole
 * answer lines from the end and appending a visible "[truncated]" marker. The result is later fenced as data
 * by the prompt builder (review/prompts.ts), never interpolated as instructions.
 */
export async function combinedBrief(ctx: AppContext, projectId: string): Promise<string> {
  const free = (await formService.getBriefText(ctx, projectId)).trim();
  const lines: string[] = [];
  if (free) lines.push(free);
  for (const f of await formService.listFilled(ctx, projectId)) {
    if (!f.snapshot) continue;
    const ans = answerLines(f.snapshot, f);
    if (ans.length === 0) continue;
    lines.push(`Form: ${oneLine(f.snapshot.title)}`, ...ans);
  }
  const full = lines.join("\n");
  if (full.length <= MAX_COMBINED_BRIEF_CHARS) return full;

  const budget = MAX_COMBINED_BRIEF_CHARS - TRUNCATED_MARKER.length - 1;
  const kept: string[] = [];
  let used = 0;
  for (const l of lines) {
    const next = used + l.length + (kept.length ? 1 : 0);
    if (next > budget) break;
    kept.push(l);
    used = next;
  }
  while (kept.length && kept[kept.length - 1].startsWith("Form: ")) kept.pop(); // no dangling form header
  return [...kept, TRUNCATED_MARKER].join("\n");
}
