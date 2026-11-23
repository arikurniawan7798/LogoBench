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

/** Reads settings.json tolerantly: corrupt JSON or invalid fields fall back to defaults (never logs values). */
async function readSaved(store: Store): Promise<Partial<Settings>> {
  let raw: unknown;
  try {
    raw = await store.readJson<unknown>(FILE);
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    console.warn(`${FILE} is corrupt (not valid JSON); using default settings. Saving settings will overwrite it.`);
    return {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: Partial<Settings> = {};
  const provider = settingsInput.shape.provider.safeParse(o.provider);
  if (provider.success) out.provider = provider.data;
  const gm = settingsInput.shape.geminiModel.safeParse(o.geminiModel);
  if (gm.success) out.geminiModel = gm.data;
  const om = settingsInput.shape.ollamaModel.safeParse(o.ollamaModel);
  if (om.success) out.ollamaModel = om.data;
  const url = settingsInput.shape.ollamaUrl.safeParse(o.ollamaUrl);
  if (url.success) out.ollamaUrl = url.data;
  if (typeof o.geminiKey === "string" && o.geminiKey) out.geminiKey = o.geminiKey;
  return out;
}

/** Effective settings: saved file (with defaults), and saved key beating the env key. */
export async function loadSettings(store: Store): Promise<Settings> {
  const saved = await readSaved(store);
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
  const saved = await readSaved(store);
  const { geminiKey, ...rest } = parsed.data;
  const key = geminiKey === undefined ? saved.geminiKey : geminiKey || undefined;
  await store.writeJson(FILE, { ...rest, ...(key ? { geminiKey: key } : {}) });
}

export function publicSettings(s: Settings) {
  const { geminiKey, ...rest } = s;
  return { ...rest, hasGeminiKey: Boolean(geminiKey) };
}
