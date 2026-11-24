import { useEffect, useRef, useState } from "react";
import {
  IDENTITY_STEPS,
  streamCreateIdentity,
  urls,
  type ApiError,
  type IdentityStep,
  type StepError,
  type StepEvent,
} from "../api";
import ErrorBanner from "../components/ErrorBanner";
import { BusyPanel } from "../components/loading";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  cn,
  IconCheck,
  IconDownload,
  IconMinus,
  IconSparkles,
  IconX,
  PageHeader,
  Spinner,
  type Tone,
} from "../components/ui";
import { useApiError, useToast } from "../components/toast";

const STEP_COPY: Record<IdentityStep, { label: string; detail: string }> = {
  review: { label: "Review", detail: "Scores and brand personality (reuses a cached review when nothing changed)." },
  colors: { label: "Colors", detail: "AI-named palette; falls back to the extracted colors. A palette you saved is kept as is." },
  type: { label: "Type", detail: "Font pairing; falls back to the default curated pairing. A type system you saved is kept as is." },
  mockups: { label: "Mockups", detail: "Website, mobile, app icon, favicon and business card." },
  identity: { label: "Identity page", detail: "A one-page site with fonts bundled, packed as a zip." },
};

type StepStatus = "pending" | "running" | "ok" | "failed" | "skipped";
type StepState = { status: StepStatus; error?: StepError; note?: string };
type Steps = Record<IdentityStep, StepState>;

const STATUS_TEXT: Record<StepStatus, string> = {
  pending: "Waiting",
  running: "Running…",
  ok: "Done",
  failed: "Failed",
  skipped: "Skipped (kept yours)",
};

const freshSteps = (): Steps =>
  Object.fromEntries(IDENTITY_STEPS.map((s) => [s, { status: "pending" }])) as Steps;

const isStep = (s: unknown): s is IdentityStep => (IDENTITY_STEPS as readonly unknown[]).includes(s);

export default function IdentityTab({ projectId }: { projectId: string }) {
  const [steps, setSteps] = useState<Steps>(freshSteps);
  const [phase, setPhase] = useState<"idle" | "running" | "finished" | "stopped">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const report = useApiError();
  const toast = useToast();

  // Abort an in-flight run when the tab unmounts or the project changes.
  useEffect(() => {
    setSteps(freshSteps());
    setPhase("idle");
    setError(null);
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      runningRef.current = false;
    };
  }, [projectId]);

  async function run() {
    if (runningRef.current) return; // double-submit guard (state updates are async)
    runningRef.current = true;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSteps(freshSteps());
    setPhase("running");
    setError(null);
    let finished = false;
    let failed = false;

    const onEvent = (e: StepEvent) => {
      if (ctrl.signal.aborted) return;
      if (e.type === "start" && isStep(e.step)) {
        setSteps((s) => ({ ...s, [e.step]: { status: "running" } }));
      } else if (e.type === "end" && isStep(e.step)) {
        setSteps((s) => ({ ...s, [e.step]: { status: e.status, error: e.error, note: e.note } }));
        if (e.status === "failed")
          toast.error(
            { code: e.error?.code ?? "SERVER", message: e.error?.message ?? "This step failed." },
            { title: `${STEP_COPY[e.step].label} step failed` },
          );
      } else if (e.type === "done" && Array.isArray(e.results)) {
        finished = true;
        setSteps((s) => {
          const next = { ...s };
          for (const r of e.results) if (isStep(r.step)) next[r.step] = { status: r.status, error: r.error, note: r.note };
          return next;
        });
      } else if (e.type === "error") {
        failed = true;
        setError(report({ code: e.error?.code ?? "SERVER", message: e.error?.message ?? "Create identity stopped unexpectedly." }));
      }
    };

    try {
      await streamCreateIdentity(projectId, onEvent, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (finished) setPhase("finished");
      else {
        setPhase("stopped");
        if (!failed)
          setError(report({ code: "SERVER", message: "The run ended before all steps reported back. Steps marked done were saved; try again." }));
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setPhase("stopped");
      setError(report(err));
    } finally {
      if (abortRef.current === ctrl) {
        abortRef.current = null;
        runningRef.current = false;
      }
    }
  }

  const running = phase === "running";
  const doneCount = IDENTITY_STEPS.filter((s) => steps[s].status === "ok").length;
  const failedCount = IDENTITY_STEPS.filter((s) => steps[s].status === "failed").length;
  const skippedCount = IDENTITY_STEPS.filter((s) => steps[s].status === "skipped").length;
  const current = IDENTITY_STEPS.findIndex((s) => steps[s].status === "running");
  const identityOk = steps.identity.status === "ok";

  let statusText = "";
  if (running) statusText = current >= 0 ? `Running step ${current + 1} of 5: ${STEP_COPY[IDENTITY_STEPS[current]].label}…` : "Starting…";
  else if (phase === "finished")
    statusText = `Finished: ${doneCount} of 5 steps done${skippedCount ? `, ${skippedCount} skipped` : ""}${failedCount ? `, ${failedCount} failed` : ""}.`;
  else if (phase === "stopped") statusText = `Stopped: ${doneCount} of 5 steps done.`;

  return (
    <div className="flex flex-col gap-6">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <PageHeader
        level={2}
        title="Create identity"
        description={
          <p>
            One action runs the whole workflow: review, colors, type, mockups, then a one-page identity you can send to a client. AI
            steps run one at a time; if one fails, the others still finish with a sensible fallback. Colors and type you saved are kept:
            those steps are skipped, never overwritten.
          </p>
        }
        actions={
          <Button variant="primary" onClick={run} loading={running} loadingText="Creating…" icon={<IconSparkles className="size-4" />}>
            {phase === "idle" ? "Create identity" : "Create identity again"}
          </Button>
        }
      />

      <BusyPanel active={running} message="Creating the identity. Each AI step can take up to a minute." />

      <Card padding="none">
        <ol className="flex flex-col p-2 sm:p-3" aria-label="Steps">
          {IDENTITY_STEPS.map((step, i) => {
            const st = steps[step];
            const labelId = `step-${step}`;
            const last = i === IDENTITY_STEPS.length - 1;
            return (
              <li
                key={step}
                data-status={st.status}
                className={cn("relative flex gap-4 rounded-lg px-3 py-3.5", st.status === "running" && "bg-accent-soft")}
                aria-labelledby={labelId}
              >
                {!last && <span className="absolute bottom-[-0.875rem] left-[1.6875rem] top-[3.25rem] w-px bg-line" aria-hidden="true" />}
                <span
                  className={cn("relative grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold", STEP_ICON_TONE[st.status])}
                  aria-hidden="true"
                >
                  {st.status === "running" ? (
                    <Spinner />
                  ) : st.status === "ok" ? (
                    <IconCheck className="size-4" />
                  ) : st.status === "failed" ? (
                    <IconX className="size-4" />
                  ) : st.status === "skipped" ? (
                    <IconMinus className="size-4" />
                  ) : (
                    i + 1
                  )}
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span id={labelId} className="text-sm font-semibold text-fg">
                      {STEP_COPY[step].label}
                    </span>
                    <Badge tone={STATUS_TONE[st.status]}>{STATUS_TEXT[st.status]}</Badge>
                  </div>
                  <p className="mt-1 text-[0.8125rem] leading-5 text-fg-muted">{STEP_COPY[step].detail}</p>
                  {st.error && <p className="mt-2 text-sm font-medium text-danger">{st.error.message}</p>}
                  {st.note && <p className="mt-2 text-sm text-fg">{st.note}</p>}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="border-t border-line px-5 py-3.5 text-sm font-medium text-fg empty:border-t-0 empty:p-0" role="status">
          {statusText}
        </p>
      </Card>

      {phase === "finished" &&
        (identityOk ? (
          <Callout tone="success" title="Your identity page is ready">
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <ButtonLink variant="primary" href={urls.identityZip(projectId)} download icon={<IconDownload className="size-4" />}>
                Download identity page (.zip)
              </ButtonLink>
              <span className="text-sm text-fg-muted">Unzip and open index.html; it works offline.</span>
            </div>
          </Callout>
        ) : (
          <p className="text-sm text-fg-muted">The identity page could not be built this time. Fix the problem shown above and run it again.</p>
        ))}
    </div>
  );
}

const STEP_ICON_TONE: Record<StepStatus, string> = {
  pending: "bg-surface text-fg-subtle ring-1 ring-line-strong",
  running: "bg-surface text-accent-text ring-2 ring-accent",
  ok: "bg-success-soft text-success ring-1 ring-success-line",
  failed: "bg-danger-soft text-danger ring-1 ring-danger-line",
  skipped: "bg-muted-bg text-fg-muted ring-1 ring-line",
};

const STATUS_TONE: Record<StepStatus, Tone> = {
  pending: "neutral",
  running: "accent",
  ok: "success",
  failed: "danger",
  skipped: "neutral",
};
