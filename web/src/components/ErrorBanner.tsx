import type { ApiError } from "../api";
import { href } from "../router";

const SETTINGS_CODES = new Set(["NO_KEY", "BAD_KEY", "BAD_MODEL"]);

/** Dismissible error banner for a normalized server error. All text is rendered as plain React text. */
export default function ErrorBanner({ error, onDismiss }: { error: ApiError | null; onDismiss: () => void }) {
  if (!error) return null;
  const retry = error.code === "RATE_LIMIT" && error.retryAfterSec ? Math.ceil(error.retryAfterSec) : null;
  return (
    <div className="banner banner-error" role="alert">
      <div className="banner-body">
        <p className="banner-title">{titleFor(error.code)}</p>
        <p>{error.message}</p>
        {retry !== null && (
          <p className="banner-retry">
            The provider asked us to wait. You can try again in about {retry} {retry === 1 ? "second" : "seconds"}.
          </p>
        )}
        {error.code === "RATE_LIMIT" && retry === null && <p className="banner-retry">Wait a moment before trying again.</p>}
        {SETTINGS_CODES.has(error.code) && (
          <p>
            <a href={href.settings()}>Open Settings</a> to check the AI provider and model.
          </p>
        )}
      </div>
      <button type="button" className="banner-dismiss" onClick={onDismiss} aria-label="Dismiss error">
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

function titleFor(code: string): string {
  switch (code) {
    case "RATE_LIMIT":
      return "Rate limit reached";
    case "NO_KEY":
      return "No API key configured";
    case "BAD_KEY":
      return "API key rejected";
    case "BAD_MODEL":
      return "Model not available";
    case "BAD_OUTPUT":
      return "The model's answer could not be used";
    case "NETWORK":
      return "Could not reach the AI provider";
    case "OFFLINE":
      return "Server unreachable";
    case "UNSUPPORTED_MEDIA":
      return "Unsupported file";
    case "TOO_LARGE":
      return "File too large";
    case "NOT_FOUND":
      return "Not found";
    default:
      return "Something went wrong";
  }
}
