import { useEffect, useState, type FormEvent } from "react";
import {
  api,
  logoUrl,
  toApiError,
  DIMENSIONS,
  MAX_BRIEF_CHARS,
  type ApiError,
  type Compare,
  type CompareSummary,
  type Project,
} from "../api";
import ErrorBanner from "../components/ErrorBanner";
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
        setError(toApiError(e));
      },
    );
    return () => {
      live = false;
    };
  }, []);

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
      setError(toApiError(err));
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
      setError(toApiError(err));
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
      setError(toApiError(err));
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await api.deleteCompare(id);
      setHistory((h) => h.filter((x) => x.id !== id));
      setResult((r) => (r?.id === id ? null : r));
    } catch (err) {
      setError(toApiError(err));
    }
  }

  return (
    <div className="compare">
      <h1>Compare</h1>
      <p className="muted section-note">
        Put two or three of your logos side by side against one brief. The model scores each on the same five dimensions and
        recommends one, as a prompt for your own judgment.
      </p>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {projects === null && (
        <p className="muted" role="status">
          Loading your logos…
        </p>
      )}

      {projects !== null && projects.length < MIN && !error && (
        <div className="empty">
          <p className="empty-title">Not enough logos yet</p>
          <p className="muted">
            Compare needs at least two logos. <a href={href.home()}>Upload another one</a>.
          </p>
        </div>
      )}

      {projects !== null && projects.length >= MIN && (
        <form className="card compare-form" onSubmit={onSubmit} noValidate>
          <fieldset className="plain-fieldset" aria-describedby="pick-hint">
            <legend className="field-legend">Logos to compare</legend>
            <p id="pick-hint" className="muted small">
              Choose 2 or 3, in the order you want them shown. {selected.length} selected.
            </p>
            <ul className="pick-list">
              {projects.map((p) => {
                const latest = p.versions[p.versions.length - 1];
                const checked = selected.includes(p.id);
                return (
                  <li key={p.id}>
                    <label className={checked ? "pick is-checked" : "pick"}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} />
                      <span className="thumb">
                        <img src={logoUrl(p.id, latest?.id)} alt="" loading="lazy" />
                      </span>
                      <span className="pick-name">{p.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
          {invalid && (
            <p className="field-error" role="alert">
              Choose 2 or 3 logos to compare (you have {selected.length} selected).
            </p>
          )}
          <div className="field">
            <label htmlFor="compare-brief">Brief (optional)</label>
            <textarea
              id="compare-brief"
              rows={3}
              maxLength={MAX_BRIEF_CHARS}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Who is it for, and what should it say?"
            />
            <span className="muted small">
              Only this brief is used here. To start from a project&apos;s brief (its free text and filled client forms), load it below.
            </span>
            <div className="brief-from">
              <label htmlFor="compare-brief-from" className="small">
                Use brief from project…
              </label>
              <select
                id="compare-brief-from"
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
              </select>
            </div>
            {briefNote && (
              <p className="muted small" role="status">
                {briefNote}
              </p>
            )}
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={running} aria-busy={running}>
              {running ? "Comparing…" : "Compare logos"}
            </button>
          </div>
        </form>
      )}

      {result && <CompareResult compare={result} nameOf={nameOf} projects={byId} />}

      {history.length > 0 && (
        <section className="compare-history" aria-labelledby="past-title">
          <h2 id="past-title">Past comparisons</h2>
          <ul className="link-list">
            {history.map((h) => (
              <li key={h.id} className="history-row">
                <span>
                  {h.projectIds.map(nameOf).join(" vs ")} · winner {nameOf(h.winnerProjectId)}{" "}
                  <span className="muted small">{formatDate(h.createdAt)}</span>
                </span>
                <span className="row-actions">
                  <button type="button" className="btn btn-small" onClick={() => open(h.id)}>
                    Open
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => remove(h.id)} aria-label={`Delete comparison from ${formatDate(h.createdAt)}`}>
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CompareResult({ compare, nameOf, projects }: { compare: Compare; nameOf: (id: string) => string; projects: Map<string, Project> }) {
  const ids = compare.items.map((i) => i.projectId);
  const winner = compare.result.recommendation.winnerProjectId;
  return (
    <section className="compare-result" aria-labelledby="result-title">
      <h2 id="result-title">Recommended: {nameOf(winner)}</h2>
      <p className="review-summary">{compare.result.recommendation.reason}</p>
      {compare.brief && (
        <p className="muted small">
          Brief: <span>{compare.brief}</span>
        </p>
      )}

      <div className="table-wrap">
        <table className="compare-table">
          <caption className="sr-only">Scores out of 10 per logo</caption>
          <thead>
            <tr>
              <th scope="col">Dimension</th>
              {ids.map((id) => (
                <th key={id} scope="col">
                  <span className="compare-col">
                    <span className="thumb thumb-small">
                      <img src={logoUrl(id, lastVersionId(projects.get(id)))} alt="" />
                    </span>
                    {nameOf(id)}
                    {id === winner && <span className="badge">pick</span>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DIMENSIONS.map((d) => (
              <tr key={d}>
                <th scope="row">{DIMENSION_COPY[d].label}</th>
                {ids.map((id) => {
                  const s = compare.result.scores[id]?.[d];
                  return (
                    <td key={id}>
                      {s ? (
                        <>
                          <span className="score-cell">{s.score}/10</span>
                          <span className="muted small cell-reason">{s.reason}</span>
                        </>
                      ) : (
                        "–"
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="total-row">
              <th scope="row">Total (out of 50)</th>
              {ids.map((id) => (
                <td key={id}>
                  <span className="score-cell">{compare.result.totals[id] ?? "–"}</span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {compare.result.notes.length > 0 && (
        <>
          <h3>Notes</h3>
          <ul>
            {compare.result.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function lastVersionId(p: Project | undefined): string | undefined {
  return p ? p.versions[p.versions.length - 1]?.id : undefined;
}
