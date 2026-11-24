import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type ApiError, type FormQuestionInput, type FormTemplate, type QuestionType } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import {
  Button,
  Card,
  CardHeader,
  cn,
  EmptyState,
  IconArrowDown,
  IconArrowUp,
  IconForms,
  IconPencil,
  IconPlus,
  IconTrash,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from "../components/ui";
import { useApiError, useToast, useToastsEnabled } from "../components/toast";

const TYPE_LABELS: Record<QuestionType, string> = { text: "Short answer", longtext: "Long answer", choice: "Multiple choice" };
const MAX_QUESTIONS = 30;

type DraftQ = { key: number; id?: string; text: string; type: QuestionType; optionsText: string };
type Draft = { id?: string; title: string; questions: DraftQ[] };

const optionsOf = (q: DraftQ) =>
  q.optionsText
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean);

/** Client-side check mirroring the server's template schema (server/src/forms.ts); the server still validates. */
function problemWith(d: Draft): string | null {
  if (!d.title.trim()) return "Give the template a title.";
  if (d.title.trim().length > 120) return "The title is too long (120 characters at most).";
  for (const [i, q] of d.questions.entries()) {
    if (!q.text.trim()) return `Question ${i + 1} has no text.`;
    if (q.type === "choice") {
      const n = optionsOf(q).length;
      if (n < 2 || n > 10) return `Question ${i + 1} needs 2 to 10 options, one per line.`;
    }
  }
  return null;
}

function toInput(d: Draft): { title: string; questions: FormQuestionInput[] } {
  return {
    title: d.title.trim(),
    questions: d.questions.map((q) => ({
      ...(q.id ? { id: q.id } : {}),
      text: q.text.trim(),
      type: q.type,
      ...(q.type === "choice" ? { options: optionsOf(q) } : {}),
    })),
  };
}

export default function FormsPage() {
  const [templates, setTemplates] = useState<FormTemplate[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState("");
  const keyRef = useRef(0);
  const report = useApiError();
  const toast = useToast();
  const toastsOn = useToastsEnabled();

  useEffect(() => {
    let live = true;
    api.listForms().then(
      (ts) => live && setTemplates(ts),
      (e) => {
        if (!live) return;
        setTemplates([]);
        setError(report(e));
      },
    );
    return () => {
      live = false;
    };
  }, [report]);

  const nextKey = () => ++keyRef.current;

  function startNew() {
    setDraft({ title: "", questions: [] });
    setProblem(null);
    setNotice("");
  }

  function startEdit(t: FormTemplate) {
    setDraft({
      id: t.id,
      title: t.title,
      questions: t.questions.map((q) => ({ key: nextKey(), id: q.id, text: q.text, type: q.type, optionsText: (q.options ?? []).join("\n") })),
    });
    setProblem(null);
    setNotice("");
  }

  const updateQ = (key: number, patch: Partial<DraftQ>) =>
    setDraft((d) => (d ? { ...d, questions: d.questions.map((q) => (q.key === key ? { ...q, ...patch } : q)) } : d));

  function addQuestion() {
    setDraft((d) => (d && d.questions.length < MAX_QUESTIONS ? { ...d, questions: [...d.questions, { key: nextKey(), text: "", type: "text", optionsText: "" }] } : d));
  }

  function removeQuestion(key: number) {
    setDraft((d) => (d ? { ...d, questions: d.questions.filter((q) => q.key !== key) } : d));
  }

  function moveQuestion(index: number, delta: -1 | 1) {
    setDraft((d) => {
      if (!d) return d;
      const j = index + delta;
      if (j < 0 || j >= d.questions.length) return d;
      const qs = [...d.questions];
      [qs[index], qs[j]] = [qs[j], qs[index]];
      return { ...d, questions: qs };
    });
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!draft || saving) return;
    const p = problemWith(draft);
    setProblem(p);
    if (p) return;
    setSaving(true);
    setError(null);
    try {
      const input = toInput(draft);
      const saved = draft.id ? await api.updateForm(draft.id, input) : await api.createForm(input);
      setTemplates((ts) => {
        const list = ts ?? [];
        return list.some((t) => t.id === saved.id) ? list.map((t) => (t.id === saved.id ? saved : t)) : [...list, saved];
      });
      setDraft(null);
      setNotice(`Saved "${saved.title}".`);
      toast.success("Template saved.", `Saved "${saved.title}".`);
    } catch (err) {
      setError(report(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(t: FormTemplate) {
    setError(null);
    try {
      await api.deleteForm(t.id);
      setTemplates((ts) => (ts ?? []).filter((x) => x.id !== t.id));
      if (draft?.id === t.id) setDraft(null);
      setNotice(`Deleted "${t.title}". Forms already filled in for projects keep their answers.`);
      toast.success("Template deleted.", `Deleted "${t.title}". Forms already filled in for projects keep their answers.`);
    } catch (err) {
      setError(report(err));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Forms"
        description={
          <p>
            Reusable client questionnaires. Fill one in for a project on its Advanced tab; the answers become part of the brief that
            reviews and suggestions read.
          </p>
        }
        actions={
          templates !== null && !draft ? (
            <Button variant="primary" onClick={startNew} icon={<IconPlus className="size-4" />}>
              New template
            </Button>
          ) : undefined
        }
      />

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {templates === null ? (
        <Skeleton label="Loading templates…" lines={3} />
      ) : (
        <>
          {templates.length === 0 ? (
            <EmptyState icon={<IconForms />} title="No templates yet">
              Start one with the questions you usually ask a client before a logo job.
            </EmptyState>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Templates">
              {templates.map((t) => (
                <Card as="li" padding="sm" key={t.id} className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text" aria-hidden="true">
                      <IconForms className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-fg">{t.title}</span>{" "}
                      <span className="text-sm text-fg-muted">
                        {t.questions.length} {t.questions.length === 1 ? "question" : "questions"}
                      </span>
                    </span>
                  </div>
                  <span className="mt-auto flex gap-2">
                    <Button size="sm" onClick={() => startEdit(t)} disabled={saving} aria-label={`Edit ${t.title}`} icon={<IconPencil className="size-4" />}>
                      Edit
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(t)} disabled={saving} aria-label={`Delete ${t.title}`} icon={<IconTrash className="size-4" />}>
                      Delete
                    </Button>
                  </span>
                </Card>
              ))}
            </ul>
          )}

          <p className={cn("text-sm text-fg-muted", toastsOn && "empty:hidden")} role={toastsOn ? undefined : "status"}>
            {notice}
          </p>
        </>
      )}

      {draft && (
        <Card as="form" onSubmit={onSave} noValidate aria-labelledby="editor-title" className="flex flex-col gap-5">
          <CardHeader flush level={2} id="editor-title" title={draft.id ? "Edit template" : "New template"} />
          <Input
            id="tpl-title"
            label="Template title"
            autoFocus
            type="text"
            maxLength={120}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />

          {draft.questions.length === 0 && (
            <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-fg-muted">No questions yet.</p>
          )}
          <ol className="flex flex-col gap-3">
            {draft.questions.map((q, i) => {
              const n = i + 1;
              const base = `q-${q.key}`;
              return (
                <li key={q.key} className="flex gap-3 rounded-xl border border-line bg-subtle p-4">
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-surface text-xs font-semibold text-fg-muted ring-1 ring-line"
                    aria-hidden="true"
                  >
                    {n}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem]">
                      <Input
                        id={`${base}-text`}
                        label={`Question ${n}`}
                        type="text"
                        maxLength={300}
                        value={q.text}
                        onChange={(e) => updateQ(q.key, { text: e.target.value })}
                      />
                      <Select
                        id={`${base}-type`}
                        label={`Question ${n} answer type`}
                        value={q.type}
                        onChange={(e) => updateQ(q.key, { type: e.target.value as QuestionType })}
                      >
                        {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
                          <option key={t} value={t}>
                            {TYPE_LABELS[t]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {q.type === "choice" && (
                      <Textarea
                        id={`${base}-options`}
                        label={`Question ${n} options`}
                        rows={3}
                        value={q.optionsText}
                        onChange={(e) => updateQ(q.key, { optionsText: e.target.value })}
                        hint="One option per line, 2 to 10 options."
                      />
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => moveQuestion(i, -1)} disabled={i === 0} aria-label={`Move question ${n} up`} icon={<IconArrowUp className="size-4" />}>
                        Up
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => moveQuestion(i, 1)}
                        disabled={i === draft.questions.length - 1}
                        aria-label={`Move question ${n} down`}
                        icon={<IconArrowDown className="size-4" />}
                      >
                        Down
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeQuestion(q.key)} aria-label={`Remove question ${n}`} icon={<IconTrash className="size-4" />}>
                        Remove
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <div>
            <Button onClick={addQuestion} disabled={draft.questions.length >= MAX_QUESTIONS} icon={<IconPlus className="size-4" />}>
              Add question
            </Button>
          </div>

          {problem && (
            <p className="text-sm font-medium text-danger" role="alert">
              {problem}
            </p>
          )}

          <div className="flex flex-wrap gap-2 border-t border-line pt-5">
            <Button type="submit" variant="primary" loading={saving} loadingText="Saving…">
              Save template
            </Button>
            <Button onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
