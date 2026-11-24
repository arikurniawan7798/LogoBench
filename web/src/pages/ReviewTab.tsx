import { useEffect, useState } from "react";
import { api, type ApiError, type Personality, type ReviewResult } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import { BusyLabel, BusyPanel, Skeleton } from "../components/loading";
import { useApiError } from "../components/toast";
import ScoreList from "../components/ScoreList";

const PERSONALITY_LABELS: Record<keyof Personality, string> = {
  presence: "Presence",
  attitude: "Attitude",
  formality: "Formality",
  style: "Style",
  tone: "Tone",
  positioning: "Positioning",
};

type State =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; result: ReviewResult; cached: boolean; createdAt?: string };

export default function ReviewTab({ projectId }: { projectId: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const report = useApiError();

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    setError(null);
    api.getReview(projectId).then(
      (r) => live && setState(r ? { status: "ready", result: r.result, cached: r.cached, createdAt: r.createdAt } : { status: "empty" }),
      (e) => {
        if (!live) return;
        setState({ status: "empty" });
        setError(report(e));
      },
    );
    return () => {
      live = false;
    };
  }, [projectId, report]);

  async function run(force: boolean) {
    setRunning(true);
    setError(null);
    try {
      const r = await api.runReview(projectId, { force });
      setState({ status: "ready", result: r.result, cached: r.cached });
    } catch (e) {
      setError(report(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="review">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <BusyPanel active={running} message="Asking the model to review your logo…" />

      {state.status === "loading" && (
        <Skeleton label="Loading review…" lines={4} />
      )}

      {state.status === "empty" && (
        <div className="review-empty">
          <h2>No review yet</h2>
          <p className="muted">
            Ask the model for a first read: five scores out of 10, each with a reason, and a sketch of the brand personality the mark
            projects.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => run(false)} disabled={running} aria-busy={running}>
            <BusyLabel busy={running} busyText="Reviewing…">
              Run review
            </BusyLabel>
          </button>
        </div>
      )}

      {state.status === "ready" && (
        <>
          <div className="review-head">
            <div>
              <h2>Review</h2>
              <p className="muted review-note">
                One model&rsquo;s read of your logo. Treat the numbers as prompts for your own judgment, not as a grade.
              </p>
            </div>
            <div className="review-actions">
              {state.cached && (
                <span className="badge" title="Served from the local cache: same image, prompt and model as last time.">
                  cached
                </span>
              )}
              {state.createdAt && <span className="muted small">Reviewed {formatDate(state.createdAt)}</span>}
              <button type="button" className="btn" onClick={() => run(true)} disabled={running} aria-busy={running}>
                <BusyLabel busy={running} busyText="Reviewing…">
                  Re-run
                </BusyLabel>
              </button>
            </div>
          </div>

          <p className="review-summary">{state.result.summary}</p>

          <ScoreList scores={state.result.scores} />

          <section className="personality" aria-labelledby="personality-title">
            <h3 id="personality-title">Brand personality</h3>
            <p className="muted small">How the mark is likely to come across, in a word or two per trait.</p>
            <dl>
              {(Object.keys(PERSONALITY_LABELS) as (keyof Personality)[]).map((k) => (
                <div key={k} className="trait">
                  <dt>{PERSONALITY_LABELS[k]}</dt>
                  <dd>{state.result.personality[k]}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
