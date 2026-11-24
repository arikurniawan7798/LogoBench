import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toApiError, type ApiError } from "../api";
import { ErrorDetails, titleFor } from "./errorCopy";
import { cn } from "./ui/cn";
import { IconAlert, IconCheck, IconInfo, IconX } from "./ui/icons";

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
      <div
        className="pointer-events-none fixed inset-x-3 bottom-3 z-[70] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[24rem]"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
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
      className={cn(
        "pointer-events-auto flex animate-toast-in items-start gap-3 rounded-xl border bg-surface p-3.5 pr-2.5 text-sm shadow-pop",
        isError ? "border-danger-line" : "border-line",
      )}
      role={isError ? "alert" : "status"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full",
          isError ? "bg-danger-soft text-danger" : toast.kind === "success" ? "bg-success-soft text-success" : "bg-info-soft text-info",
        )}
        aria-hidden="true"
      >
        {isError ? <IconAlert className="size-4" /> : toast.kind === "success" ? <IconCheck className="size-4" /> : <IconInfo className="size-4" />}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5 pt-0.5 leading-5">
        {toast.error ? (
          <ErrorDetails error={toast.error} title={toast.title} onNavigate={() => onClose(toast.id)} />
        ) : (
          <>
            <p className="font-semibold text-fg">{toast.title}</p>
            {toast.message && <p className="text-fg-muted">{toast.message}</p>}
          </>
        )}
        {toast.count > 1 && <p className="text-xs font-medium text-fg-subtle">Happened {toast.count} times</p>}
      </div>
      <button
        type="button"
        className="grid size-7 shrink-0 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-accent-soft hover:text-accent-text"
        onClick={() => onClose(toast.id)}
        aria-label="Dismiss notification"
      >
        <IconX className="size-4" />
      </button>
    </div>
  );
}
