import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, toApiError, type ApiError, type FormQuestionInput, type FormTemplate, type QuestionType } from "../api";
import ErrorBanner from "../components/ErrorBanner";

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

  useEffect(() => {
    let live = true;
    api.listForms().then(
      (ts) => live && setTemplates(ts),
      (e) => {
        if (!live) return;
        setTemplates([]);
        setError(toApiError(e));
      },
    );
    return () => {
      live = false;
    };
  }, []);

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
    } catch (err) {
      setError(toApiError(err));
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
    } catch (err) {
      setError(toApiError(err));
    }
  }

  return (
    <div className="forms">
      <h1>Forms</h1>
      <p className="muted section-note">
        Reusable client questionnaires. Fill one in for a project on its Advanced tab; the answers become part of the brief that
        reviews and suggestions read.
      </p>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {templates === null ? (
        <p className="muted" role="status">
          Loading templates…
        </p>
      ) : (
        <>
          {templates.length === 0 ? (
            <div className="empty">
              <p className="empty-title">No templates yet</p>
              <p className="muted">Start one with the questions you usually ask a client before a logo job.</p>
            </div>
          ) : (
            <ul className="template-list" aria-label="Templates">
              {templates.map((t) => (
                <li key={t.id} className="template-row">
                  <span>
                    <span className="template-title">{t.title}</span>{" "}
                    <span className="muted small">
                      {t.questions.length} {t.questions.length === 1 ? "question" : "questions"}
                    </span>
                  </span>
                  <span className="row-actions">
                    <button type="button" className="btn btn-small" onClick={() => startEdit(t)} disabled={saving} aria-label={`Edit ${t.title}`}>
                      Edit
                    </button>
                    <button type="button" className="btn btn-small" onClick={() => remove(t)} disabled={saving} aria-label={`Delete ${t.title}`}>
                      Delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="muted small" role="status">
            {notice}
          </p>

          {!draft && (
            <p>
              <button type="button" className="btn btn-primary" onClick={startNew}>
                New template
              </button>
            </p>
          )}
        </>
      )}

      {draft && (
        <form className="card template-editor" onSubmit={onSave} noValidate aria-labelledby="editor-title">
          <h2 id="editor-title">{draft.id ? "Edit template" : "New template"}</h2>
          <div className="field">
            <label htmlFor="tpl-title">Template title</label>
            <input
              id="tpl-title"
              autoFocus
              type="text"
              maxLength={120}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>

          {draft.questions.length === 0 && <p className="muted small">No questions yet.</p>}
          <ol className="question-list">
            {draft.questions.map((q, i) => {
              const n = i + 1;
              const base = `q-${q.key}`;
              return (
                <li key={q.key} className="question">
                  <div className="field">
                    <label htmlFor={`${base}-text`}>Question {n}</label>
                    <input id={`${base}-text`} type="text" maxLength={300} value={q.text} onChange={(e) => updateQ(q.key, { text: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor={`${base}-type`}>Question {n} answer type</label>
                    <select id={`${base}-type`} value={q.type} onChange={(e) => updateQ(q.key, { type: e.target.value as QuestionType })}>
                      {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                  {q.type === "choice" && (
                    <div className="field">
                      <label htmlFor={`${base}-options`}>Question {n} options</label>
                      <textarea
                        id={`${base}-options`}
                        rows={3}
                        value={q.optionsText}
                        onChange={(e) => updateQ(q.key, { optionsText: e.target.value })}
                        aria-describedby={`${base}-options-hint`}
                      />
                      <span id={`${base}-options-hint`} className="muted small">
                        One option per line, 2 to 10 options.
                      </span>
                    </div>
                  )}
                  <div className="row-actions">
                    <button type="button" className="btn btn-small" onClick={() => moveQuestion(i, -1)} disabled={i === 0} aria-label={`Move question ${n} up`}>
                      Up
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => moveQuestion(i, 1)}
                      disabled={i === draft.questions.length - 1}
                      aria-label={`Move question ${n} down`}
                    >
                      Down
                    </button>
                    <button type="button" className="btn btn-small" onClick={() => removeQuestion(q.key)} aria-label={`Remove question ${n}`}>
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>

          <p>
            <button type="button" className="btn" onClick={addQuestion} disabled={draft.questions.length >= MAX_QUESTIONS}>
              Add question
            </button>
          </p>

          {problem && (
            <p className="field-error" role="alert">
              {problem}
            </p>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving}>
              {saving ? "Saving…" : "Save template"}
            </button>
            <button type="button" className="btn" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
