import { useEffect, useState, type FormEvent } from "react";
import {
  api,
  logoUrl,
  DIMENSIONS,
  MAX_BRIEF_CHARS,
  type ApiError,
  type Compare,
  type CompareSummary,
  type Project,
} from "../api";
import ErrorBanner from "../components/ErrorBanner";
import { BusyPanel } from "../components/loading";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  cn,
  EmptyState,
  IconCompare,
  IconTrophy,
  PageHeader,
  ScoreBar,
  Select,
  Skeleton,
  Spinner,
  Textarea,
} from "../components/ui";
import { useApiError } from "../components/toast";
import { DIMENSION_COPY } from "../components/ScoreList";
import { href } from "../router";

const MIN = 2;
const MAX = 3;

export default function ComparePage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [history, setHistory] = useState<CompareSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [brief, setBrief] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Compare | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [briefFrom, setBriefFrom] = useState("");
  const [briefNote, setBriefNote] = useState("");
  const [loadingBrief, setLoadingBrief] = useState(false);
  const report = useApiError();

  useEffect(() => {
    let live = true;
    Promise.all([api.listProjects(), api.listCompares()]).then(
      ([ps, cs]) => {
        if (!live) return;
        setProjects([...ps].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        setHistory(cs);
      },
      (e) => {
        if (!live) return;
        setProjects([]);
        setError(report(e));
      },
    );
    return () => {
      live = false;
    };
  }, [report]);

  const byId = new Map((projects ?? []).map((p) => [p.id, p]));
  const nameOf = (id: string) => byId.get(id)?.name ?? "Deleted project";
  const countOk = selected.length >= MIN && selected.length <= MAX;

  function toggle(id: string) {
    setSelected((s) => {
      const next = s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
      if (invalid && next.length >= MIN && next.length <= MAX) setInvalid(false);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (running) return;
    if (!countOk) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setRunning(true);
    setError(null);
    try {
      // Pick order is kept: the first logo chosen is the first column.
      const c = await api.createCompare(selected, brief);
      setResult(c);
      setHistory((h) => [
        { id: c.id, createdAt: c.createdAt, projectIds: c.items.map((i) => i.projectId), winnerProjectId: c.result.recommendation.winnerProjectId },
        ...h.filter((x) => x.id !== c.id),
      ]);
    } catch (err) {
      setError(report(err));
    } finally {
      setRunning(false);
    }
  }

  /** Loads a project's combined brief (its free text plus filled client forms) into the textarea, capped at MAX_BRIEF_CHARS. */
  async function loadProjectBrief(projectId: string) {
    setBriefFrom(projectId);
    if (!projectId || loadingBrief) return;
    setLoadingBrief(true);
    setError(null);
    setBriefNote("");
    const name = nameOf(projectId);
    try {
      const { text } = await api.getBrief(projectId);
      const trimmed = text.trim();
      if (!trimmed) {
        setBriefNote(`${name} has no brief yet. Add one in its Advanced tab or fill a client form.`);
      } else if (trimmed.length > MAX_BRIEF_CHARS) {
        setBrief(trimmed.slice(0, MAX_BRIEF_CHARS));
        setBriefNote(
          `Loaded the brief from ${name}. It was ${trimmed.length} characters, so it was trimmed to ${MAX_BRIEF_CHARS} characters; edit it down if the end matters.`,
        );
      } else {
        setBrief(trimmed);
        setBriefNote(`Loaded the brief from ${name}. Edit it freely; the project's own brief is not changed.`);
      }
    } catch (err) {
      setError(report(err));
    } finally {
      setLoadingBrief(false);
      setBriefFrom("");
    }
  }

  async function open(id: string) {
    setError(null);
    try {
      setResult(await api.getCompare(id));
    } catch (err) {
      setError(report(err));
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await api.deleteCompare(id);
      setHistory((h) => h.filter((x) => x.id !== id));
      setResult((r) => (r?.id === id ? null : r));
    } catch (err) {
      setError(report(err));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Compare"
        description={
          <p>
            Put two or three of your logos side by side against one brief. The model scores each on the same five dimensions and
            recommends one, as a prompt for your own judgment.
          </p>
        }
      />

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {projects === null && <Skeleton label="Loading your logos…" lines={3} variant="cards" />}

      {projects !== null && projects.length < MIN && !error && (
        <EmptyState icon={<IconCompare />} title="Not enough logos yet">
          Compare needs at least two logos. <a href={href.home()}>Upload another one</a>.
        </EmptyState>
      )}

      {projects !== null && projects.length >= MIN && (
        <Card as="form" onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <fieldset aria-describedby="pick-hint" className="flex min-w-0 flex-col gap-3">
            <legend className="mb-1 text-base font-semibold tracking-tight text-fg">Logos to compare</legend>
            <p id="pick-hint" className="text-sm text-fg-muted">
              Choose 2 or 3, in the order you want them shown. {selected.length} selected.
            </p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
              {projects.map((p) => {
                const latest = p.versions[p.versions.length - 1];
                const checked = selected.includes(p.id);
                const order = selected.indexOf(p.id) + 1;
                return (
                  <li key={p.id}>
                    <label
                      className={cn(
                        "relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-surface transition-[border-color,box-shadow] duration-150",
                        "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring",
                        checked ? "border-accent ring-1 ring-accent" : "border-line hover:border-line-strong",
                      )}
                    >
                      <span className="relative block aspect-[4/3] border-b border-line bg-logo-canvas">
                        <img src={logoUrl(p.id, latest?.id)} alt="" loading="lazy" className="absolute inset-0 size-full object-contain p-5" />
                      </span>
                      <span className="flex items-center gap-2.5 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(p.id)}
                          className="size-4 shrink-0 cursor-pointer accent-[var(--lb-accent)] focus-visible:outline-none"
                        />
                        <span className="min-w-0 truncate text-sm font-medium text-fg">{p.name}</span>
                      </span>
                      {checked && (
                        <span
                          className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-ink shadow-sm"
                          aria-hidden="true"
                        >
                          {order}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
          {invalid && (
            <p className="-mt-3 text-sm font-medium text-danger" role="alert">
              Choose 2 or 3 logos to compare (you have {selected.length} selected).
            </p>
          )}
          <div className="flex flex-col gap-3">
            <Textarea
              id="compare-brief"
              label="Brief (optional)"
              rows={3}
              maxLength={MAX_BRIEF_CHARS}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Who is it for, and what should it say?"
              hint="Only this brief is used here. To start from a project's brief (its free text and filled client forms), load it below."
            />
            <div className="flex flex-wrap items-end gap-3">
              <Select
                id="compare-brief-from"
                label="Use brief from project…"
                wrapperClassName="w-full sm:w-72"
                value={briefFrom}
                disabled={loadingBrief}
                aria-busy={loadingBrief}
                onChange={(e) => void loadProjectBrief(e.target.value)}
              >
                <option value="">Choose a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              {loadingBrief && <Spinner label="Loading the brief" className="mb-2.5 text-accent-text" />}
            </div>
            {briefNote && (
              <p className="text-sm text-fg-muted" role="status">
                {briefNote}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-4 border-t border-line pt-5">
            <div>
              <Button type="submit" variant="primary" loading={running} loadingText="Comparing…" icon={<IconCompare className="size-4" />}>
                Compare logos
              </Button>
            </div>
            <BusyPanel active={running} message="Asking the model to compare your logos…" />
          </div>
        </Card>
      )}

      {result && <CompareResult compare={result} nameOf={nameOf} projects={byId} />}

      {history.length > 0 && (
        <Card as="section" aria-labelledby="past-title">
          <CardHeader level={2} id="past-title" title="Past comparisons" />
          <ul className="flex flex-col divide-y divide-line">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <span className="min-w-0 text-sm">
                  <span className="font-medium text-fg">{h.projectIds.map(nameOf).join(" vs ")}</span>
                  <span className="text-fg-muted"> · winner {nameOf(h.winnerProjectId)}</span>{" "}
                  <span className="block text-xs text-fg-subtle sm:inline">{formatDate(h.createdAt)}</span>
                </span>
                <span className="flex gap-2">
                  <Button size="sm" onClick={() => open(h.id)}>
                    Open
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => remove(h.id)} aria-label={`Delete comparison from ${formatDate(h.createdAt)}`}>
                    Delete
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function CompareResult({ compare, nameOf, projects }: { compare: Compare; nameOf: (id: string) => string; projects: Map<string, Project> }) {
  const ids = compare.items.map((i) => i.projectId);
  const winner = compare.result.recommendation.winnerProjectId;
  return (
    <Card as="section" padding="none" className="overflow-hidden" aria-labelledby="result-title">
      <div className="flex flex-col gap-3 border-b border-line bg-accent-soft/60 p-5 sm:flex-row sm:items-start sm:p-6">
        <span className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-accent-line bg-logo-canvas">
          <img src={logoUrl(winner, lastVersionId(projects.get(winner)))} alt="" className="absolute inset-0 size-full object-contain p-1.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent-text">
            <IconTrophy className="size-4" /> Recommendation
          </p>
          <h2 id="result-title" className="mt-0.5 text-xl font-semibold tracking-tight text-fg">
            Recommended: {nameOf(winner)}
          </h2>
          <p className="mt-2 text-[0.9375rem] leading-7 text-fg">{compare.result.recommendation.reason}</p>
          {compare.brief && (
            <p className="mt-2 text-sm text-fg-muted">
              Brief: <span>{compare.brief}</span>
            </p>
          )}
        </div>
      </div>

      <div className="relative overflow-x-auto focus-visible:outline-offset-[-2px]" tabIndex={0} role="region" aria-label="Score table (scrolls sideways)">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <caption className="sr-only">Scores out of 10 per logo</caption>
          <thead>
            <tr className="border-b border-line bg-subtle">
              <th scope="col" className="w-40 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-fg-subtle sm:px-6">
                Dimension
              </th>
              {ids.map((id) => (
                <th key={id} scope="col" className={cn("px-4 py-3 text-left align-bottom", id === winner && "bg-accent-soft/60")}>
                  <span className="flex items-center gap-2.5">
                    <span className="relative size-9 shrink-0 overflow-hidden rounded-lg border border-line bg-logo-canvas">
                      <img src={logoUrl(id, lastVersionId(projects.get(id)))} alt="" className="absolute inset-0 size-full object-contain p-1" />
                    </span>
                    <span className="min-w-0 font-semibold text-fg">{nameOf(id)}</span>
                    {id === winner && <Badge tone="accent">pick</Badge>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {DIMENSIONS.map((d) => (
              <tr key={d}>
                <th scope="row" className="px-5 py-3.5 text-left align-top font-medium text-fg sm:px-6">
                  {DIMENSION_COPY[d].label}
                </th>
                {ids.map((id) => {
                  const s = compare.result.scores[id]?.[d];
                  return (
                    <td key={id} className={cn("px-4 py-3.5 align-top", id === winner && "bg-accent-soft/30")}>
                      {s ? (
                        <div className="flex flex-col gap-1.5">
                          <ScoreBar score={s.score} className="max-w-48" />
                          <span className="text-[0.8125rem] leading-5 text-fg-muted">{s.reason}</span>
                        </div>
                      ) : (
                        "–"
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="bg-subtle">
              <th scope="row" className="px-5 py-3.5 text-left font-semibold text-fg sm:px-6">
                Total (out of 50)
              </th>
              {ids.map((id) => (
                <td key={id} className={cn("px-4 py-3.5 text-lg font-semibold tabular-nums text-fg", id === winner && "text-accent-text")}>
                  {compare.result.totals[id] ?? "–"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {compare.result.notes.length > 0 && (
        <div className="border-t border-line p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-fg">Notes</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {compare.result.notes.map((n, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-6 text-fg-muted">
                <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function lastVersionId(p: Project | undefined): string | undefined {
  return p ? p.versions[p.versions.length - 1]?.id : undefined;
}
