import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { inFlightCount, subscribeInFlight } from "../api";

/** CSS-only spinner. The ring is decorative; pass `label` for screen-reader text (visible with `showLabel`). */
export function Spinner({ label, showLabel = false, size = "sm" }: { label?: string; showLabel?: boolean; size?: "sm" | "md" }) {
  return (
    <span className="spinner-wrap">
      <span className={`spinner spinner-${size}`} aria-hidden="true" />
      {label && <span className={showLabel ? "spinner-label" : "sr-only"}>{label}</span>}
    </span>
  );
}

/** Button content: an inline spinner plus the busy text while `busy`, otherwise the idle label. */
export function BusyLabel({ busy, busyText, children }: { busy: boolean; busyText: string; children: ReactNode }) {
  return busy ? (
    <>
      <Spinner />
      {busyText}
    </>
  ) : (
    <>{children}</>
  );
}

export const SLOW_AFTER_SEC = 15;
export const SLOW_NOTE = "Still working — free-tier models can be slow or busy; the app retries automatically.";

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec} s elapsed`;
  return `${Math.floor(sec / 60)} min ${sec % 60} s elapsed`;
}

/**
 * Progress panel for long AI calls: spinner, a plain-language message, an elapsed counter and, after SLOW_AFTER_SEC, a
 * gentle "still working" note. The message and note sit in a polite live region that exists before the call starts, so
 * screen readers announce the start and the note once; the ticking counter is outside that region.
 */
export function BusyPanel({ active, message, slowAfterSec = SLOW_AFTER_SEC }: { active: boolean; message: string; slowAfterSec?: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    if (!active) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [active]);

  const slow = active && elapsed >= slowAfterSec;
  return (
    <div className={active ? "busy-panel" : "busy-panel-idle"}>
      {active && <Spinner size="md" />}
      <div className="busy-text">
        <div aria-live="polite">
          {active && <p className="busy-message">{message}</p>}
          {slow && <p className="busy-slow">{SLOW_NOTE}</p>}
        </div>
        {active && <p className="busy-elapsed muted small">{formatElapsed(elapsed)}</p>}
      </div>
    </div>
  );
}

/** Skeleton placeholder for data that is loading. Announced once as a status with `label`. */
export function Skeleton({ label, lines = 3, variant = "lines" }: { label: string; lines?: number; variant?: "lines" | "cards" }) {
  return (
    <div className={`skeleton skeleton-${variant}`} role="status">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={variant === "cards" ? "skeleton-card" : "skeleton-line"} aria-hidden="true" />
      ))}
    </div>
  );
}

/**
 * Slim bar at the top of the window while any API request is in flight. Debounced by `delay` ms so quick calls never
 * flash it; it hides as soon as the last request settles.
 */
export function GlobalProgress({ delay = 250 }: { delay?: number }) {
  const busy = useSyncExternalStore(subscribeInFlight, () => inFlightCount() > 0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [busy, delay]);

  if (!visible) return null;
  return (
    <div className="global-progress" role="progressbar" aria-label="Loading" aria-valuetext="Working…">
      <span className="global-progress-bar" />
    </div>
  );
}
