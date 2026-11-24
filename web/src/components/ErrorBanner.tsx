import type { ApiError } from "../api";
import { ErrorDetails } from "./errorCopy";
import { useToastsEnabled } from "./toast";

/**
 * Dismissible inline error banner for a normalized server error. All text is rendered as plain React text.
 * Inside a ToastProvider every error is also raised as a toast, which is the live announcer; the banner then stays
 * visible in place but is not a second role="alert".
 */
export default function ErrorBanner({ error, onDismiss }: { error: ApiError | null; onDismiss: () => void }) {
  const toasts = useToastsEnabled();
  if (!error) return null;
  return (
    <div className="banner banner-error" role={toasts ? undefined : "alert"}>
      <div className="banner-body">
        <ErrorDetails error={error} />
      </div>
      <button type="button" className="banner-dismiss" onClick={onDismiss} aria-label="Dismiss error">
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
