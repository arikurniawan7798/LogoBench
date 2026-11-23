import type { z } from "zod";
import { GeminiProvider } from "./gemini.js";
import { OllamaProvider } from "./ollama.js";

export type AiErrorCode = "NO_KEY" | "BAD_KEY" | "RATE_LIMIT" | "BAD_OUTPUT" | "NETWORK";

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly retryAfterSec?: number;
  constructor(code: AiErrorCode, message: string, opts: { retryAfterSec?: number } = {}) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.retryAfterSec = opts.retryAfterSec;
  }
}

export type GenerateRequest<T> = {
  system: string;
  prompt: string;
  images: { mime: string; bytes: Buffer }[];
  schema: z.ZodType<T>;
};

export interface Provider {
  readonly name: string;
  readonly model: string;
  generateJson<T>(req: GenerateRequest<T>): Promise<T>;
}

export type ProviderSettings = {
  provider: "gemini" | "ollama";
  geminiModel: string;
  ollamaModel: string;
  ollamaUrl: string;
  geminiKey?: string;
};

export function createProvider(settings: ProviderSettings): Provider {
  if (settings.provider === "ollama") {
    return new OllamaProvider({ model: settings.ollamaModel, url: settings.ollamaUrl });
  }
  return new GeminiProvider({ model: settings.geminiModel, apiKey: settings.geminiKey });
}
