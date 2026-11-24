import type { ApiError } from "../api";
import { ErrorDetails } from "./errorCopy";
import { useToastsEnabled } from "./toast";
import { IconAlert, IconX } from "./ui/icons";

/**
 * Dismissible inline error banner for a normalized server error. All text is rendered as plain React text.
 * Inside a ToastProvider every error is also raised as a toast, which is the live announcer; the banner then stays
 * visible in place but is not a second role="alert".
 */
export default function ErrorBanner({ error, onDismiss }: { error: ApiError | null; onDismiss: () => void }) {
  const toasts = useToastsEnabled();
  if (!error) return null;
  return (
    <div
      className="flex animate-fade-in items-start gap-3 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm"
      role={toasts ? undefined : "alert"}
    >
      <IconAlert className="mt-0.5 text-danger" />
      <div className="min-w-0 flex-1 space-y-1 leading-6">
        <ErrorDetails error={error} />
      </div>
      <button
        type="button"
        className="-mr-1.5 -mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-danger/10 hover:text-fg"
        onClick={onDismiss}
        aria-label="Dismiss error"
      >
        <IconX className="size-4" />
      </button>
    </div>
  );
}
