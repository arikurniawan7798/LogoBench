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
import { BusyPanel } from "../components/loading";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  cn,
  IconCheck,
  IconChevronRight,
  IconForms,
  IconRefresh,
  IconSparkles,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from "../components/ui";
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
    <div className="flex flex-col gap-6">
      <BriefPanel projectId={projectId} />

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <PageHeader
        level={2}
        title="Advanced review"
        description={
          <p>
            Prioritized fixes, a pre-delivery checklist and ideas for presenting the logo, read against the brief above. A repeat run
            with the same logo, brief and model is served from the local cache.
          </p>
        }
        actions={
          <>
            {result?.cached && (
              <Badge tone="info" title="Served from the local cache: same image, brief, prompt and model as last time.">
                cached
              </Badge>
            )}
            {result ? (
              <Button onClick={() => run(true)} loading={running} loadingText="Reviewing…" icon={<IconRefresh className="size-4" />}>
                Re-run
              </Button>
            ) : (
              <Button variant="primary" onClick={() => run(false)} loading={running} loadingText="Reviewing…" icon={<IconSparkles className="size-4" />}>
                Run advanced review
              </Button>
            )}
          </>
        }
      />

      <BusyPanel active={running} message="Asking the model for an advanced review against your brief…" />

      {result && <AdvancedResultView projectId={projectId} r={result.data} />}
    </div>
  );
}

const PRIORITY_TONE: Record<Priority, "danger" | "warn" | "info"> = { high: "danger", medium: "warn", low: "info" };

function AdvancedResultView({ projectId, r }: { projectId: string; r: AdvancedResult }) {
  const done = r.checklist.filter((c) => c.done).length;
  return (
    <>
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-accent-text">Summary</p>
          <p className="text-base leading-7 text-fg">{r.summary}</p>
        </div>
        <ButtonLink variant="download" href={urls.reportPdf(projectId)} download className="self-start sm:self-center">
          Download PDF report
        </ButtonLink>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card as="section" aria-labelledby="fixes-title">
          <CardHeader id="fixes-title" title="Fixes" description={r.fixes.length ? `${r.fixes.length} suggested, highest priority first.` : undefined} />
          {r.fixes.length === 0 && <p className="text-sm text-fg-muted">No fixes suggested.</p>}
          <div className="flex flex-col gap-5">
            {PRIORITIES.map(({ id, label }) => {
              const list = r.fixes.filter((f) => f.priority === id);
              if (!list.length) return null;
              return (
                <div key={id} className="flex flex-col gap-2.5">
                  <h4>
                    <Badge tone={PRIORITY_TONE[id]}>{label}</Badge>
                  </h4>
                  <ul className="flex flex-col gap-2.5">
                    {list.map((f, i) => (
                      <li key={i} className="rounded-lg border border-line bg-subtle p-3.5">
                        <p className="text-sm font-medium text-fg">{f.issue}</p>
                        <p className="mt-1 text-sm leading-6 text-fg-muted">
                          <span className="font-medium text-accent-text">Try: </span>
                          {f.fix}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card as="section" aria-labelledby="checklist-title">
            <CardHeader id="checklist-title" title="Pre-delivery checklist" description={`${done} of ${r.checklist.length} look done.`} />
            <ul className="flex flex-col divide-y divide-line">
              {r.checklist.map((c, i) => (
                <li key={i} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span
                    className={cn(
                      "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                      c.done ? "bg-success-soft text-success" : "border border-line-strong text-transparent",
                    )}
                    aria-hidden="true"
                  >
                    <IconCheck className="size-3.5" />
                  </span>
                  <span className="text-sm leading-6 text-fg">
                    {c.item} <span className="text-xs text-fg-muted">{c.done ? "(looks done)" : "(to check)"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card as="section" aria-labelledby="ideas-title">
            <CardHeader id="ideas-title" title="Presentation ideas" />
            <ul className="flex flex-col gap-2">
              {r.presentationIdeas.map((idea, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-6 text-fg">
                  <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  {idea}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <section aria-labelledby="adv-scores-title" className="flex flex-col gap-3">
        <h3 id="adv-scores-title" className="text-base font-semibold tracking-tight">
          Scores
        </h3>
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
    <Card as="section" aria-labelledby="brief-title">
      <CardHeader
        level={2}
        id="brief-title"
        title="Brief"
        icon={<IconForms className="size-4" />}
        description="What the job is about. Reviews, color and type suggestions read it."
      />
      <div className="flex flex-col gap-4">
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
        {combined === null ? (
          <Skeleton label="Loading brief…" lines={3} />
        ) : (
          <>
            <form onSubmit={saveBrief} className="flex flex-col gap-3">
              <Textarea
                id="brief-text"
                label="Notes about the client and the job"
                rows={4}
                maxLength={MAX_BRIEF_CHARS}
                value={free}
                onChange={(e) => setFree(e.target.value)}
                hint={
                  <>
                    Read by reviews, color and type suggestions as data, never as instructions.{" "}
                    <span className="tabular-nums">
                      {free.length}/{MAX_BRIEF_CHARS}
                    </span>
                  </>
                }
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={busy !== null} loading={busy === "brief"} loadingText="Saving…">
                  Save brief
                </Button>
                <p className="text-sm text-fg-muted" role={toastsOn ? undefined : "status"}>
                  {notice}
                </p>
              </div>
            </form>

            <details className="group rounded-lg border border-line bg-subtle open:bg-surface">
              <summary className={SUMMARY}>
                <IconChevronRight className="size-4 text-fg-subtle transition-transform group-open:rotate-90" />
                Client forms ({filled.length} filled)
              </summary>
              <div className="flex flex-col gap-4 border-t border-line px-4 py-4">
                {filled.length > 0 && (
                  <ul className="flex flex-col gap-1.5">
                    {filled.map((f) => (
                      <li key={f.id} className="flex items-center gap-2 text-sm">
                        <IconCheck className="size-4 text-success" />
                        <span className="font-medium">{f.snapshot?.title ?? "Form"}</span>{" "}
                        <span className="text-xs text-fg-muted">{f.createdAt ? new Date(f.createdAt).toLocaleDateString() : ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {templates.length === 0 ? (
                  <p className="text-sm text-fg-muted">
                    No form templates yet. <a href={href.forms()}>Create one on the Forms page</a>.
                  </p>
                ) : (
                  <form onSubmit={submitForm} className="flex flex-col gap-4">
                    <Select
                      id="fill-template"
                      label="Fill in a template"
                      wrapperClassName="sm:max-w-sm"
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
                    </Select>
                    {template?.questions.map((q) => {
                      const id = `ans-${q.id}`;
                      const value = answers[q.id] ?? "";
                      const set = (v: string) => setAnswers((a) => ({ ...a, [q.id]: v }));
                      return q.type === "longtext" ? (
                        <Textarea key={q.id} id={id} label={q.text} rows={3} maxLength={2000} value={value} onChange={(e) => set(e.target.value)} />
                      ) : q.type === "choice" ? (
                        <Select key={q.id} id={id} label={q.text} value={value} onChange={(e) => set(e.target.value)}>
                          <option value="">No answer</option>
                          {(q.options ?? []).map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input key={q.id} id={id} label={q.text} type="text" maxLength={300} value={value} onChange={(e) => set(e.target.value)} />
                      );
                    })}
                    {template && (
                      <div>
                        <Button type="submit" disabled={busy !== null} loading={busy === "form"} loadingText="Saving…">
                          Add answers to brief
                        </Button>
                      </div>
                    )}
                  </form>
                )}
              </div>
            </details>

            {combined && (
              <details className="group rounded-lg border border-line bg-subtle open:bg-surface">
                <summary className={SUMMARY}>
                  <IconChevronRight className="size-4 text-fg-subtle transition-transform group-open:rotate-90" />
                  What the model reads
                </summary>
                <p className="whitespace-pre-wrap break-words border-t border-line px-4 py-4 font-mono text-[0.8125rem] leading-6 text-fg-muted">
                  {combined}
                </p>
              </details>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

const SUMMARY =
  "flex cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-fg hover:text-accent-text [&::-webkit-details-marker]:hidden";
