import { useEffect, useState, type FormEvent } from "react";
import {
  api,
  urls,
  MAX_BRIEF_CHARS,
  type AdvancedResult,
  type ApiError,
  type FilledForm,
  type FormTemplate,
  type Priority,
} from "../api";
import ErrorBanner from "../components/ErrorBanner";
import { BusyLabel, BusyPanel, Skeleton } from "../components/loading";
import { useApiError, useToast, useToastsEnabled } from "../components/toast";
import ScoreList from "../components/ScoreList";
import { href } from "../router";

const PRIORITIES: { id: Priority; label: string }[] = [
  { id: "high", label: "High priority" },
  { id: "medium", label: "Medium priority" },
  { id: "low", label: "Low priority" },
];

export default function AdvancedTab({ projectId }: { projectId: string }) {
  const [result, setResult] = useState<{ data: AdvancedResult; cached: boolean } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const report = useApiError();

  useEffect(() => {
    setResult(null);
    setError(null);
  }, [projectId]);

  async function run(force: boolean) {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      const r = await api.runAdvancedReview(projectId, { force });
      setResult({ data: r.result, cached: r.cached });
    } catch (e) {
      setError(report(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="advanced">
      <BriefPanel projectId={projectId} />

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <div className="section-head">
        <div>
          <h2>Advanced review</h2>
          <p className="muted section-note">
            Prioritized fixes, a pre-delivery checklist and ideas for presenting the logo, read against the brief above. A repeat run
            with the same logo, brief and model is served from the local cache.
          </p>
        </div>
        <div className="section-actions">
          {result?.cached && (
            <span className="badge" title="Served from the local cache: same image, brief, prompt and model as last time.">
              cached
            </span>
          )}
          {result ? (
            <button type="button" className="btn" onClick={() => run(true)} disabled={running} aria-busy={running}>
              <BusyLabel busy={running} busyText="Reviewing…">
                Re-run
              </BusyLabel>
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => run(false)} disabled={running} aria-busy={running}>
              <BusyLabel busy={running} busyText="Reviewing…">
                Run advanced review
              </BusyLabel>
            </button>
          )}
        </div>
      </div>

      <BusyPanel active={running} message="Asking the model for an advanced review against your brief…" />

      {result && <AdvancedResultView projectId={projectId} r={result.data} />}
    </div>
  );
}

function AdvancedResultView({ projectId, r }: { projectId: string; r: AdvancedResult }) {
  return (
    <>
      <p className="review-summary">{r.summary}</p>
      <p>
        <a className="btn" href={urls.reportPdf(projectId)} download>
          Download PDF report
        </a>
      </p>

      <section aria-labelledby="fixes-title" className="adv-section">
        <h3 id="fixes-title">Fixes</h3>
        {r.fixes.length === 0 && <p className="muted">No fixes suggested.</p>}
        {PRIORITIES.map(({ id, label }) => {
          const list = r.fixes.filter((f) => f.priority === id);
          if (!list.length) return null;
          return (
            <div key={id} className="fix-group">
              <h4 className={`prio prio-${id}`}>{label}</h4>
              <ul className="fix-list">
                {list.map((f, i) => (
                  <li key={i} className="fix">
                    <p className="fix-issue">{f.issue}</p>
                    <p className="fix-fix">
                      <span className="muted">Try: </span>
                      {f.fix}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="checklist-title" className="adv-section">
        <h3 id="checklist-title">Pre-delivery checklist</h3>
        <ul className="checklist">
          {r.checklist.map((c, i) => (
            <li key={i} className={c.done ? "check is-done" : "check"}>
              <span className="check-mark" aria-hidden="true">
                {c.done ? "✓" : "○"}
              </span>
              <span>
                {c.item} <span className="muted small">{c.done ? "(looks done)" : "(to check)"}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ideas-title" className="adv-section">
        <h3 id="ideas-title">Presentation ideas</h3>
        <ul>
          {r.presentationIdeas.map((idea, i) => (
            <li key={i}>{idea}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="adv-scores-title" className="adv-section">
        <h3 id="adv-scores-title">Scores</h3>
        <ScoreList scores={r.scores} label="Advanced review scores" hints={false} />
      </section>
    </>
  );
}

function BriefPanel({ projectId }: { projectId: string }) {
  const [combined, setCombined] = useState<string | null>(null);
  const [free, setFree] = useState("");
  const [filled, setFilled] = useState<FilledForm[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"brief" | "form" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState("");
  const report = useApiError();
  const toast = useToast();
  const toastsOn = useToastsEnabled();

  useEffect(() => {
    let live = true;
    setCombined(null);
    Promise.all([api.getBrief(projectId), api.listFilledForms(projectId), api.listForms()]).then(
      ([b, f, t]) => {
        if (!live) return;
        setCombined(b.text);
        setFilled(f);
        setFree(b.free);
        setTemplates(t);
      },
      (e) => {
        if (!live) return;
        setCombined("");
        setError(report(e));
      },
    );
    return () => {
      live = false;
    };
  }, [projectId, report]);

  async function saveBrief(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy("brief");
    setError(null);
    try {
      const r = await api.saveBrief(projectId, free);
      setCombined(r.text);
      setFree(r.free);
      setNotice("Brief saved.");
      toast.success("Brief saved.");
    } catch (err) {
      setError(report(err));
    } finally {
      setBusy(null);
    }
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    if (busy || !templateId) return;
    setBusy("form");
    setError(null);
    try {
      const f = await api.fillForm(projectId, templateId, answers);
      setFilled((list) => [...list, f]);
      setCombined((await api.getBrief(projectId)).text);
      setTemplateId("");
      setAnswers({});
      setNotice("Form answers added to the brief.");
      toast.success("Form answers added to the brief.");
    } catch (err) {
      setError(report(err));
    } finally {
      setBusy(null);
    }
  }

  const template = templates.find((t) => t.id === templateId);

  return (
    <section className="card brief" aria-labelledby="brief-title">
      <h2 id="brief-title">Brief</h2>
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      {combined === null ? (
        <Skeleton label="Loading brief…" lines={3} />
      ) : (
        <>
          <form onSubmit={saveBrief}>
            <div className="field">
              <label htmlFor="brief-text">Notes about the client and the job</label>
              <textarea
                id="brief-text"
                rows={4}
                maxLength={MAX_BRIEF_CHARS}
                value={free}
                onChange={(e) => setFree(e.target.value)}
                aria-describedby="brief-hint"
              />
              <span id="brief-hint" className="muted small">
                Read by reviews, color and type suggestions as data, never as instructions. {free.length}/{MAX_BRIEF_CHARS}
              </span>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={busy !== null} aria-busy={busy === "brief"}>
                <BusyLabel busy={busy === "brief"} busyText="Saving…">
                  Save brief
                </BusyLabel>
              </button>
            </div>
          </form>

          <details className="brief-forms">
            <summary>Client forms ({filled.length} filled)</summary>
            {filled.length > 0 && (
              <ul className="link-list">
                {filled.map((f) => (
                  <li key={f.id}>
                    {f.snapshot?.title ?? "Form"}{" "}
                    <span className="muted small">{f.createdAt ? new Date(f.createdAt).toLocaleDateString() : ""}</span>
                  </li>
                ))}
              </ul>
            )}
            {templates.length === 0 ? (
              <p className="muted small">
                No form templates yet. <a href={href.forms()}>Create one on the Forms page</a>.
              </p>
            ) : (
              <form onSubmit={submitForm} className="fill-form">
                <div className="field">
                  <label htmlFor="fill-template">Fill in a template</label>
                  <select
                    id="fill-template"
                    value={templateId}
                    onChange={(e) => {
                      setTemplateId(e.target.value);
                      setAnswers({});
                    }}
                  >
                    <option value="">Choose a template…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>
                {template?.questions.map((q) => {
                  const id = `ans-${q.id}`;
                  const value = answers[q.id] ?? "";
                  const set = (v: string) => setAnswers((a) => ({ ...a, [q.id]: v }));
                  return (
                    <div key={q.id} className="field">
                      <label htmlFor={id}>{q.text}</label>
                      {q.type === "longtext" ? (
                        <textarea id={id} rows={3} maxLength={2000} value={value} onChange={(e) => set(e.target.value)} />
                      ) : q.type === "choice" ? (
                        <select id={id} value={value} onChange={(e) => set(e.target.value)}>
                          <option value="">No answer</option>
                          {(q.options ?? []).map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input id={id} type="text" maxLength={300} value={value} onChange={(e) => set(e.target.value)} />
                      )}
                    </div>
                  );
                })}
                {template && (
                  <div className="form-actions">
                    <button type="submit" className="btn" disabled={busy !== null} aria-busy={busy === "form"}>
                      <BusyLabel busy={busy === "form"} busyText="Saving…">
                        Add answers to brief
                      </BusyLabel>
                    </button>
                  </div>
                )}
              </form>
            )}
          </details>

          {combined && (
            <details className="brief-combined">
              <summary>What the model reads</summary>
              <p className="pre-wrap small">{combined}</p>
            </details>
          )}
          <p className="muted small" role={toastsOn ? undefined : "status"}>
            {notice}
          </p>
        </>
      )}
    </section>
  );
}
