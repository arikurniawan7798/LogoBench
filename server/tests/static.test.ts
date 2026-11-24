import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { request } from "./helpers/request.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";

let root: string;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "logobench-static-"));
  const web = path.join(root, "web");
  await fs.mkdir(path.join(web, "assets"), { recursive: true });
  await fs.writeFile(path.join(web, "index.html"), "<!doctype html><title>SPA</title>");
  await fs.writeFile(path.join(web, "assets", "app.js"), "console.log(1)");
  await fs.writeFile(path.join(root, "secret.txt"), "top secret");
  app = createApp({ hostCheck: false, dataDir: path.join(root, "data"), webDir: web });
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("static web serving", () => {
  it("serves index.html at /", async () => {
    const r = await request(app).get("/");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/html/);
    expect(r.text).toContain("SPA");
  });
  it("serves assets with their content type", async () => {
    const r = await request(app).get("/assets/app.js");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/javascript/);
  });
  it("falls back to index.html for deep links", async () => {
    const r = await request(app).get("/project/abc123");
    expect(r.status).toBe(200);
    expect(r.text).toContain("SPA");
  });
  it("leaves API routes alone, including unknown /api paths (no HTML fallback)", async () => {
    expect((await request(app).get("/api/health")).body).toEqual({ ok: true });
    const r = await request(app).get("/api/nope");
    expect(r.status).toBe(404);
    expect(r.text).not.toContain("SPA");
  });
  it("does not serve files outside the web dir", async () => {
    for (const p of ["/../secret.txt", "/%2e%2e/secret.txt", "/..%2fsecret.txt", "/assets/..%2f..%2fsecret.txt"]) {
      const r = await request(app).get(p);
      expect(r.text, p).not.toContain("top secret");
    }
  });
  it("only falls back for GET", async () => {
    expect((await request(app).post("/project/abc")).status).toBe(404);
  });
  it("without webDir nothing is served at /", async () => {
    const plain = createApp({ hostCheck: false, dataDir: path.join(root, "data2") });
    expect((await request(plain).get("/")).status).toBe(404);
  });
});
