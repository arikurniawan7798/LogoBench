import { useEffect, useRef, useState } from "react";
import {
  IDENTITY_STEPS,
  streamCreateIdentity,
  toApiError,
  urls,
  type ApiError,
  type IdentityStep,
  type StepError,
  type StepEvent,
} from "../api";
import ErrorBanner from "../components/ErrorBanner";

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
const STATUS_ICON: Record<StepStatus, string> = { pending: "○", running: "◐", ok: "✓", failed: "✕", skipped: "–" };

const freshSteps = (): Steps =>
  Object.fromEntries(IDENTITY_STEPS.map((s) => [s, { status: "pending" }])) as Steps;

const isStep = (s: unknown): s is IdentityStep => (IDENTITY_STEPS as readonly unknown[]).includes(s);

export default function IdentityTab({ projectId }: { projectId: string }) {
  const [steps, setSteps] = useState<Steps>(freshSteps);
  const [phase, setPhase] = useState<"idle" | "running" | "finished" | "stopped">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

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
      } else if (e.type === "done" && Array.isArray(e.results)) {
        finished = true;
        setSteps((s) => {
          const next = { ...s };
          for (const r of e.results) if (isStep(r.step)) next[r.step] = { status: r.status, error: r.error, note: r.note };
          return next;
        });
      } else if (e.type === "error") {
        failed = true;
        setError({ code: e.error?.code ?? "SERVER", message: e.error?.message ?? "Create identity stopped unexpectedly." });
      }
    };

    try {
      await streamCreateIdentity(projectId, onEvent, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (finished) setPhase("finished");
      else {
        setPhase("stopped");
        if (!failed)
          setError({ code: "SERVER", message: "The run ended before all steps reported back. Steps marked done were saved; try again." });
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setPhase("stopped");
      setError(toApiError(err));
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
    <div className="identity">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <div className="section-head">
        <div>
          <h2>Create identity</h2>
          <p className="muted section-note">
            One action runs the whole workflow: review, colors, type, mockups, then a one-page identity you can send to a client. AI
            steps run one at a time; if one fails, the others still finish with a sensible fallback. Colors and type you saved are kept:
            those steps are skipped, never overwritten.
          </p>
        </div>
        <div className="section-actions">
          <button type="button" className="btn btn-primary" onClick={run} disabled={running} aria-busy={running}>
            {running ? "Creating…" : phase === "idle" ? "Create identity" : "Create identity again"}
          </button>
        </div>
      </div>

      <ol className="steps" aria-label="Steps">
        {IDENTITY_STEPS.map((step) => {
          const st = steps[step];
          const labelId = `step-${step}`;
          return (
            <li key={step} className={`step step-${st.status}`} aria-labelledby={labelId}>
              <span className="step-icon" aria-hidden="true">
                {STATUS_ICON[st.status]}
              </span>
              <div className="step-body">
                <div className="step-top">
                  <span id={labelId} className="step-label">
                    {STEP_COPY[step].label}
                  </span>
                  <span className="step-status">{STATUS_TEXT[st.status]}</span>
                </div>
                <p className="muted small step-detail">{STEP_COPY[step].detail}</p>
                {st.error && <p className="step-error">{st.error.message}</p>}
                {st.note && <p className="step-note">{st.note}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="identity-status" role="status">
        {statusText}
      </p>

      {phase === "finished" &&
        (identityOk ? (
          <p>
            <a className="btn btn-primary" href={urls.identityZip(projectId)} download>
              Download identity page (.zip)
            </a>{" "}
            <span className="muted small">Unzip and open index.html; it works offline.</span>
          </p>
        ) : (
          <p className="muted">The identity page could not be built this time. Fix the problem shown above and run it again.</p>
        ))}
    </div>
  );
}
