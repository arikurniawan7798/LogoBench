import { AiError, type GenerateRequest, type Provider } from "./provider.js";
import { generateValidated, withBackoff } from "./structured.js";
import { DEFAULT_GEMINI_MODEL, GEMINI_TIMEOUT_MS } from "../config.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export type GeminiOpts = {
  model?: string;
  apiKey?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  retries?: number;
  timeoutMs?: number;
  baseMs?: number;
};

export class GeminiProvider implements Provider {
  readonly name = "gemini";
  readonly model: string;
  constructor(private opts: GeminiOpts = {}) {
    this.model = opts.model || DEFAULT_GEMINI_MODEL;
  }

  async generateJson<T>(req: GenerateRequest<T>): Promise<T> {
    // Checked before any network activity.
    if (!this.opts.apiKey) throw new AiError("NO_KEY", "No Gemini API key configured");
    return generateValidated(
      () =>
        withBackoff(() => this.callOnce(req), {
          retries: this.opts.retries ?? 2,
          baseMs: this.opts.baseMs ?? 1000,
          sleep: this.opts.sleep,
        }),
      req.schema,
    );
  }

  private scrub(s: string): string {
    const key = this.opts.apiKey;
    return key ? s.split(key).join("[redacted]") : s;
  }

  private async callOnce<T>(req: GenerateRequest<T>): Promise<string> {
    const doFetch = this.opts.fetch ?? globalThis.fetch;
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [
        {
          role: "user",
          parts: [
            { text: req.prompt },
            ...req.images.map((i) => ({ inlineData: { mimeType: i.mime, data: i.bytes.toString("base64") } })),
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json" },
    };
    let res: Response;
    try {
      res = await doFetch(`${BASE}/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.opts.apiKey! },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? GEMINI_TIMEOUT_MS),
      });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") throw new AiError("NETWORK", "The Gemini API request timed out");
      throw new AiError("NETWORK", "Could not reach the Gemini API");
    }
    if (!res.ok) throw await this.httpError(res);
    let data: any;
    try {
      data = await res.json();
    } catch {
      throw new AiError("BAD_OUTPUT", "Gemini returned a non-JSON response");
    }
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("");
    if (!text) throw new AiError("BAD_OUTPUT", "Gemini returned no content");
    return text;
  }

  private async httpError(res: Response): Promise<AiError> {
    let detail: any;
    try {
      detail = (await res.json())?.error;
    } catch {
      detail = undefined;
    }
    const msg = this.scrub(String(detail?.message ?? res.statusText ?? "request failed"));
    if (res.status === 429) {
      return new AiError("RATE_LIMIT", "Gemini rate limit or quota reached", { retryAfterSec: retryAfter(res, detail) });
    }
    const keyProblem = /api[ _]key|API_KEY/i.test(msg);
    if (res.status === 401 || ((res.status === 400 || res.status === 403) && keyProblem)) {
      return new AiError("BAD_KEY", "Gemini rejected the API key");
    }
    if (res.status === 404) {
      return new AiError("BAD_MODEL", `Gemini model "${this.model}" was not found; change the model name in Settings`);
    }
    if (res.status === 403) {
      // Not a key problem: usually no access to this model/region. Not retried.
      return new AiError("BAD_MODEL", `Gemini denied access to model "${this.model}" (${msg}); check the model name in Settings`);
    }
    if (res.status >= 500) return new AiError("NETWORK", `Gemini server error (${res.status})`);
    return new AiError("BAD_OUTPUT", `Gemini request failed (${res.status}): ${msg}`);
  }
}

function retryAfter(res: Response, detail: any): number | undefined {
  const h = Number(res.headers.get("retry-after"));
  if (Number.isFinite(h) && h > 0) return Math.ceil(h);
  const info = (detail?.details ?? []).find((d: any) => String(d?.["@type"] ?? "").endsWith("RetryInfo"));
  const s = parseFloat(info?.retryDelay ?? "");
  return Number.isFinite(s) && s > 0 ? Math.ceil(s) : undefined;
}
