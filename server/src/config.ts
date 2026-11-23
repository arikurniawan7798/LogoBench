import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

export function loadConfig(): { port: number; dataDir: string; geminiKey?: string } {
  return {
    port: Number(process.env.PORT) || 3001,
    dataDir: process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.join(repoRoot, "data"),
    geminiKey: process.env.GEMINI_API_KEY || undefined,
  };
}
