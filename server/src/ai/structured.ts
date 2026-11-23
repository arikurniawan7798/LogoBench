import type { z } from "zod";
import { AiError } from "./provider.js";

/** Find the first balanced top-level JSON object in text (string-aware). */
function extractObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

export function parseModelJson<T>(raw: string, schema: z.ZodType<T>): T {
  const text = raw.replace(/```(?:json)?/gi, "");
  const obj = extractObject(text);
  if (!obj) throw new AiError("BAD_OUTPUT", "Model reply contained no JSON object");
  let value: unknown;
  try {
    value = JSON.parse(obj);
  } catch {
    throw new AiError("BAD_OUTPUT", "Model reply was not valid JSON");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AiError("BAD_OUTPUT", `Model JSON failed validation at ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  return parsed.data;
}

/** Call the model, validate; on BAD_OUTPUT retry exactly once. */
export async function generateValidated<T>(call: () => Promise<string>, schema: z.ZodType<T>): Promise<T> {
  try {
    return parseModelJson(await call(), schema);
  } catch (e) {
    if (!(e instanceof AiError) || e.code !== "BAD_OUTPUT") throw e;
  }
  return parseModelJson(await call(), schema);
}

export type BackoffOpts = { retries: number; baseMs: number; sleep?: (ms: number) => Promise<void> };

/** Longest server retry hint we will wait out in-request (seconds). */
export const MAX_RETRY_AFTER_SEC = 20;
const MAX_SLEEP_MS = MAX_RETRY_AFTER_SEC * 1000;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withBackoff<T>(fn: () => Promise<T>, opts: BackoffOpts): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const retryable = e instanceof AiError && (e.code === "RATE_LIMIT" || e.code === "NETWORK");
      if (!retryable || attempt >= opts.retries) throw e;
      // Fail fast on long server hints so the UI can show the wait instead of holding the request.
      if (e.retryAfterSec && e.retryAfterSec > MAX_RETRY_AFTER_SEC) throw e;
      const exp = opts.baseMs * 2 ** attempt;
      await sleep(Math.min(MAX_SLEEP_MS, e.retryAfterSec ? Math.max(e.retryAfterSec * 1000, exp) : exp));
    }
  }
}
