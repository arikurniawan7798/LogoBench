import { z } from "zod";
import type { Store } from "./storage.js";
import type { ProviderSettings } from "./ai/provider.js";
import { DEFAULT_GEMINI_MODEL, DEFAULT_OLLAMA_MODEL, loadConfig } from "./config.js";

export type Settings = ProviderSettings;

const FILE = "settings.json";
// 127.0.0.1 rather than localhost: Node may resolve localhost to ::1 while Ollama listens on IPv4.
const DEFAULT_URL = "http://127.0.0.1:11434";

export class SettingsValidationError extends Error {}

const httpUrl = z.string().refine((v) => {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}, "ollamaUrl must be a valid http(s) URL");

export const settingsInput = z.object({
  provider: z.enum(["gemini", "ollama"]),
  geminiModel: z.string().trim().min(1, "geminiModel must not be empty"),
  ollamaModel: z.string().trim().min(1, "ollamaModel must not be empty"),
  ollamaUrl: httpUrl,
  geminiKey: z.string().optional(),
});

/** Effective settings: saved file (with defaults), and saved key beating the env key. */
export async function loadSettings(store: Store): Promise<Settings> {
  const saved = (await store.readJson<Partial<Settings>>(FILE)) ?? {};
  const geminiKey = saved.geminiKey || loadConfig().geminiKey || undefined;
  return {
    provider: saved.provider ?? "gemini",
    geminiModel: saved.geminiModel ?? DEFAULT_GEMINI_MODEL,
    ollamaModel: saved.ollamaModel ?? DEFAULT_OLLAMA_MODEL,
    ollamaUrl: saved.ollamaUrl ?? DEFAULT_URL,
    geminiKey,
  };
}

export async function saveSettings(store: Store, input: unknown): Promise<void> {
  const parsed = settingsInput.safeParse(input);
  if (!parsed.success) {
    throw new SettingsValidationError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  const saved = (await store.readJson<Partial<Settings>>(FILE)) ?? {};
  const { geminiKey, ...rest } = parsed.data;
  const key = geminiKey === undefined ? saved.geminiKey : geminiKey || undefined;
  await store.writeJson(FILE, { ...rest, ...(key ? { geminiKey: key } : {}) });
}

export function publicSettings(s: Settings) {
  const { geminiKey, ...rest } = s;
  return { ...rest, hasGeminiKey: Boolean(geminiKey) };
}
