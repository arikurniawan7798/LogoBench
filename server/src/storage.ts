import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export class Store {
  private root: string;

  constructor(dataDir: string) {
    this.root = path.resolve(dataDir);
  }

  private resolve(rel: string): string {
    const full = path.resolve(this.root, rel);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error(`Path escapes data directory: ${rel}`);
    }
    return full;
  }

  async readJson<T>(rel: string): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(this.resolve(rel), "utf8")) as T;
    } catch (e: any) {
      if (e?.code === "ENOENT") return null;
      throw e;
    }
  }

  async writeJson(rel: string, data: unknown): Promise<void> {
    await this.writeFile(rel, Buffer.from(JSON.stringify(data, null, 2), "utf8"));
  }

  async writeFile(rel: string, data: Buffer): Promise<void> {
    const full = this.resolve(rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  async readFile(rel: string): Promise<Buffer> {
    return fs.readFile(this.resolve(rel));
  }

  async list(relDir: string): Promise<string[]> {
    try {
      return await fs.readdir(this.resolve(relDir));
    } catch (e: any) {
      if (e?.code === "ENOENT") return [];
      throw e;
    }
  }

  newId(): string {
    return crypto.randomUUID();
  }
}
