import type { ApiError } from "../api";
import { href } from "../router";

const SETTINGS_CODES = new Set(["NO_KEY", "BAD_KEY", "BAD_MODEL"]);

export function titleFor(code: string): string {
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

/** The retry hint for a RATE_LIMIT error, or null for any other code. */
export function retryNote(error: ApiError): string | null {
  if (error.code !== "RATE_LIMIT") return null;
  const retry = error.retryAfterSec ? Math.ceil(error.retryAfterSec) : null;
  if (retry === null) return "Wait a moment before trying again.";
  return `The provider asked us to wait. You can try again in about ${retry} ${retry === 1 ? "second" : "seconds"}.`;
}

export const needsSettings = (error: ApiError) => SETTINGS_CODES.has(error.code);

/**
 * Title, message, retry hint and Settings link for a normalized error. Shared by the inline ErrorBanner and the error
 * toast so the copy lives in one place. All text is rendered as plain React text.
 */
export function ErrorDetails({ error, title, onNavigate }: { error: ApiError; title?: string; onNavigate?: () => void }) {
  const retry = retryNote(error);
  return (
    <>
      <p className="font-semibold text-fg">{title ?? titleFor(error.code)}</p>
      <p className="break-words text-fg-muted">{error.message}</p>
      {retry && <p className="font-medium text-fg">{retry}</p>}
      {needsSettings(error) && (
        <p>
          <a href={href.settings()} onClick={onNavigate}>
            Open Settings for setup steps
          </a>
        </p>
      )}
    </>
  );
}
