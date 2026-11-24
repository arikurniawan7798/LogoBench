import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { inFlightCount, subscribeInFlight } from "../api";
import { Spinner } from "./ui/Spinner";
import { Skeleton } from "./ui/Skeleton";

export { Spinner, Skeleton };

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
    <div
      className={
        active
          ? "flex animate-fade-in items-start gap-3 rounded-xl border border-accent-line bg-accent-soft px-4 py-3.5 text-accent-text"
          : "sr-only"
      }
    >
      {active && <Spinner size="md" className="mt-0.5" />}
      <div className="min-w-0 flex-1 space-y-0.5">
        <div aria-live="polite">
          {active && <p className="text-sm font-medium text-fg">{message}</p>}
          {slow && <p className="text-sm text-fg-muted">{SLOW_NOTE}</p>}
        </div>
        {active && <p className="text-xs tabular-nums text-fg-muted">{formatElapsed(elapsed)}</p>}
      </div>
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
    <div
      className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-accent/15"
      role="progressbar"
      aria-label="Loading"
      aria-valuetext="Working…"
    >
      <span className="block h-full w-2/5 animate-progress rounded-full bg-accent" />
    </div>
  );
}
