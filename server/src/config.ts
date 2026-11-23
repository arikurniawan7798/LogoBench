import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

/** Current free-tier Gemini vision "flash" model; override via settings. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
/** Request timeouts (ms); vision models can be slow to load locally. */
export const GEMINI_TIMEOUT_MS = 60_000;
export const OLLAMA_TIMEOUT_MS = 180_000;
export const DEFAULT_OLLAMA_MODEL = "llama3.2-vision";
export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

export function loadConfig(): { port: number; dataDir: string; geminiKey?: string } {
  return {
    port: Number(process.env.PORT) || 3001,
    dataDir: process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.join(repoRoot, "data"),
    geminiKey: process.env.GEMINI_API_KEY || undefined,
  };
}
