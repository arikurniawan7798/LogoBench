import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toApiError, type ApiError } from "../api";
import { ErrorDetails, titleFor } from "./errorCopy";

/**
 * Toast notifications. Errors are role="alert" and stay ~10 s; successes are role="status" and stay ~5 s. A toast never
 * auto-dismisses while hovered or while focus is inside it. Identical consecutive toasts are merged with a counter, and
 * at most MAX_TOASTS are shown (the oldest is dropped). Without a ToastProvider every call is a no-op, so pages still
 * work (and keep their inline role="alert" banners) when rendered on their own.
 */

export type ToastKind = "error" | "success" | "info";
export type ToastInput = { kind: ToastKind; title: string; message?: string; error?: ApiError };
type Toast = ToastInput & { id: number; count: number };

type ToastApi = {
  notify: (t: ToastInput) => void;
  error: (e: ApiError, opts?: { title?: string }) => void;
  success: (title: string, message?: string) => void;
  dismiss: (id: number) => void;
};

export const MAX_TOASTS = 3;
const DURATION: Record<ToastKind, number> = { error: 10_000, success: 5_000, info: 5_000 };
/** After a pause, a toast always gets at least this long before it goes. */
const MIN_RESUME = 2_000;

const ToastContext = createContext<ToastApi | null>(null);

const NOOP: ToastApi = { notify: () => {}, error: () => {}, success: () => {}, dismiss: () => {} };

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}

/** True inside a ToastProvider: errors are announced by the toast, so inline banners should not announce again. */
export function useToastsEnabled(): boolean {
  return useContext(ToastContext) !== null;
}

/**
 * The one pattern pages use for failures: `setError(report(e))` normalizes any thrown value (or a client-side ApiError)
 * to an ApiError, raises an error toast for it, and returns it for the inline banner.
 */
export function useApiError(): (e: unknown, opts?: { title?: string }) => ApiError {
  const { error } = useToast();
  return useCallback(
    (e: unknown, opts?: { title?: string }) => {
      const err = toApiError(e);
      error(err, opts);
      return err;
    },
    [error],
  );
}

const sameToast = (a: ToastInput, b: ToastInput) => a.kind === b.kind && a.title === b.title && (a.message ?? "") === (b.message ?? "");

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const notify = useCallback((input: ToastInput) => {
    setToasts((list) => {
      const last = list[list.length - 1];
      if (last && sameToast(last, input)) return [...list.slice(0, -1), { ...last, ...input, count: last.count + 1 }];
      nextId.current += 1;
      return [...list, { ...input, id: nextId.current, count: 1 }].slice(-MAX_TOASTS);
    });
  }, []);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const api = useMemo<ToastApi>(
    () => ({
      notify,
      dismiss,
      error: (e, opts) => notify({ kind: "error", title: opts?.title ?? titleFor(e.code), message: e.message, error: e }),
      success: (title, message) => notify({ kind: "success", title, message }),
    }),
    [notify, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const duration = DURATION[toast.kind];
  const remaining = useRef(duration);
  const paused = hovered || focused;

  // A repeat of the same toast restarts its clock. Declared before the timer effect so it runs first.
  useEffect(() => {
    remaining.current = duration;
  }, [toast.count, duration]);

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(() => onClose(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(MIN_RESUME, remaining.current - (Date.now() - started));
    };
  }, [paused, toast.count, toast.id, onClose]);

  const isError = toast.kind === "error";
  return (
    <div
      className={`toast toast-${toast.kind}`}
      role={isError ? "alert" : "status"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <span className="toast-icon" aria-hidden="true">
        {isError ? "!" : "✓"}
      </span>
      <div className="toast-body">
        {toast.error ? (
          <ErrorDetails error={toast.error} title={toast.title} onNavigate={() => onClose(toast.id)} />
        ) : (
          <>
            <p className="toast-title">{toast.title}</p>
            {toast.message && <p>{toast.message}</p>}
          </>
        )}
        {toast.count > 1 && <p className="toast-count">Happened {toast.count} times</p>}
      </div>
      <button type="button" className="banner-dismiss toast-dismiss" onClick={() => onClose(toast.id)} aria-label="Dismiss notification">
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
