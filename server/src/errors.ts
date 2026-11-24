import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { AiError } from "./ai/provider.js";
import { NotFoundError, UnsupportedMediaError } from "./projects.js";
import { SettingsValidationError } from "./settings.js";

/** Typed error carrying an HTTP status and a client-safe message. */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

const AI_STATUS = { NO_KEY: 401, BAD_KEY: 401, RATE_LIMIT: 429, BAD_MODEL: 422, BAD_OUTPUT: 422, NETWORK: 502 } as const;

/** Client-safe message for an AI error (NO_KEY / BAD_MODEL point the user to Settings). */
export function aiMessage(e: AiError): string {
  switch (e.code) {
    case "NO_KEY":
      return "No Gemini API key configured. Set GEMINI_API_KEY in the server's .env file, then restart the server (see the Settings page for setup steps).";
    case "BAD_MODEL":
      return `${e.message} Change the model in Settings.`;
    case "RATE_LIMIT":
      return e.retryAfterSec ? `${e.message} Retry in about ${e.retryAfterSec}s.` : e.message;
    default:
      return e.message;
  }
}

/** Central Express error middleware: AI errors, upload/project errors, settings validation, fallback 500. */
export function errorHandler(err: any, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) return next(err);
  if (err instanceof AiError) {
    if (err.code === "RATE_LIMIT" && err.retryAfterSec) res.setHeader("Retry-After", String(err.retryAfterSec));
    res.status(AI_STATUS[err.code]).json({
      error: { code: err.code, message: aiMessage(err), ...(err.retryAfterSec ? { retryAfterSec: err.retryAfterSec } : {}) },
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof SettingsValidationError) {
    res.status(422).json({ error: err.message });
    return;
  }
  if (err instanceof multer.MulterError) {
    res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: err.message });
    return;
  }
  if (err instanceof UnsupportedMediaError) {
    res.status(415).json({ error: err.message });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  // body-parser errors (carry a `type`): fixed messages only, never the parser's text (may quote the body).
  if (typeof err?.type === "string" && err.status >= 400 && err.status < 500) {
    const msg =
      err.type === "entity.parse.failed" ? "Invalid JSON body"
      : err.status === 413 ? "Request body too large"
      : err.status === 415 ? "Unsupported media type"
      : "Bad request";
    res.status(err.status).json({ error: msg });
    return;
  }
  if (err?.status === 400) {
    res.status(400).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal error" });
}
