import { AiError, type GenerateRequest, type Provider } from "./provider.js";
import { generateValidated, withBackoff } from "./structured.js";
import { DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL, OLLAMA_TIMEOUT_MS } from "../config.js";

export type OllamaOpts = {
  model?: string;
  url?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  retries?: number;
  timeoutMs?: number;
  baseMs?: number;
};

export class OllamaProvider implements Provider {
  readonly name = "ollama";
  readonly model: string;
  private url: string;
  constructor(private opts: OllamaOpts = {}) {
    this.model = opts.model || DEFAULT_OLLAMA_MODEL;
    this.url = (opts.url || DEFAULT_OLLAMA_URL).replace(/\/+$/, "");
  }

  generateJson<T>(req: GenerateRequest<T>): Promise<T> {
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

  private async callOnce<T>(req: GenerateRequest<T>): Promise<string> {
    const doFetch = this.opts.fetch ?? globalThis.fetch;
    const body = {
      model: this.model,
      stream: false,
      format: "json",
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.prompt, images: req.images.map((i) => i.bytes.toString("base64")) },
      ],
    };
    let res: Response;
    try {
      res = await doFetch(`${this.url}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? OLLAMA_TIMEOUT_MS),
      });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") throw new AiError("NETWORK", `Ollama at ${this.url} timed out`);
      throw new AiError("NETWORK", `Could not reach Ollama at ${this.url}`);
    }
    if (!res.ok) {
      if (res.status === 404) {
        throw new AiError("BAD_MODEL", `Ollama model "${this.model}" not found; run: ollama pull ${this.model}`);
      }
      if (res.status >= 500) throw new AiError("NETWORK", `Ollama server error (${res.status})`);
      throw new AiError("BAD_OUTPUT", `Ollama request failed (${res.status}); is model "${this.model}" pulled?`);
    }
    let data: any;
    try {
      data = await res.json();
    } catch {
      throw new AiError("BAD_OUTPUT", "Ollama returned a non-JSON response");
    }
    const text = data?.message?.content;
    if (typeof text !== "string" || !text) throw new AiError("BAD_OUTPUT", "Ollama returned no content");
    return text;
  }
}
