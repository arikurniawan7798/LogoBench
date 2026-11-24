import { useEffect, useState } from "react";
import { api, type ApiError, type Personality, type ReviewResult } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import { BusyPanel } from "../components/loading";
import { Badge, Button, Card, CardHeader, Chip, EmptyState, IconRefresh, IconSparkles, PageHeader, Skeleton } from "../components/ui";
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
    <div className="flex flex-col gap-6">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <BusyPanel active={running} message="Asking the model to review your logo…" />

      {state.status === "loading" && <Skeleton label="Loading review…" lines={4} />}

      {state.status === "empty" && (
        <EmptyState
          titleAs="h2"
          icon={<IconSparkles />}
          title="No review yet"
          action={
            <Button variant="primary" onClick={() => run(false)} loading={running} loadingText="Reviewing…" icon={<IconSparkles className="size-4" />}>
              Run review
            </Button>
          }
        >
          Ask the model for a first read: five scores out of 10, each with a reason, and a sketch of the brand personality the mark
          projects.
        </EmptyState>
      )}

      {state.status === "ready" && (
        <>
          <PageHeader
            level={2}
            title="Review"
            description={
              <p>One model&rsquo;s read of your logo. Treat the numbers as prompts for your own judgment, not as a grade.</p>
            }
            actions={
              <>
                {state.cached && (
                  <Badge tone="info" title="Served from the local cache: same image, prompt and model as last time.">
                    cached
                  </Badge>
                )}
                {state.createdAt && <span className="text-xs text-fg-muted">Reviewed {formatDate(state.createdAt)}</span>}
                <Button onClick={() => run(true)} loading={running} loadingText="Reviewing…" icon={<IconRefresh className="size-4" />}>
                  Re-run
                </Button>
              </>
            }
          />

          <Card className="relative overflow-hidden">
            <span className="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden="true" />
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-accent-text">Summary</p>
            <p className="text-base leading-7 text-fg">{state.result.summary}</p>
          </Card>

          <ScoreList scores={state.result.scores} />

          <Card as="section" aria-labelledby="personality-title">
            <CardHeader
              id="personality-title"
              title="Brand personality"
              description="How the mark is likely to come across, in a word or two per trait."
            />
            <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {(Object.keys(PERSONALITY_LABELS) as (keyof Personality)[]).map((k) => (
                <Chip key={k} label={PERSONALITY_LABELS[k]} value={state.result.personality[k]} />
              ))}
            </dl>
          </Card>
        </>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
