import { it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { errorHandler } from "../src/errors.js";
import { AiError } from "../src/ai/provider.js";
import { loadSettings } from "../src/settings.js";
import { DEFAULT_GEMINI_MODEL } from "../src/config.js";

let dir: string;
const savedEnv = process.env.GEMINI_API_KEY;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-settings-"));
  delete process.env.GEMINI_API_KEY;
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  if (savedEnv === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedEnv;
});

const body = { provider: "ollama", geminiModel: "g-model", ollamaModel: "o-model", ollamaUrl: "http://127.0.0.1:11434" };

function appThrowing(err: Error) {
  const app = express();
  app.get("/boom", (_req, _res, next) => next(err));
  app.use(errorHandler);
  return app;
}

it("GET never contains the key string", async () => {
  const app = createApp({ dataDir: dir });
  const put = await request(app).put("/api/settings").send({ ...body, geminiKey: "SECRET-KEY-123" });
  expect(put.status).toBe(200);
  const get = await request(app).get("/api/settings");
  expect(get.body.hasGeminiKey).toBe(true);
  expect(get.body).not.toHaveProperty("geminiKey");
  expect(JSON.stringify([put.body, get.body])).not.toContain("SECRET-KEY-123");
});

it("defaults, env key, and omitting geminiKey keeps the saved key", async () => {
  const app = createApp({ dataDir: dir });
  const d = await request(app).get("/api/settings");
  expect(d.body).toMatchObject({ provider: "gemini", hasGeminiKey: false, ollamaUrl: "http://127.0.0.1:11434" });
  process.env.GEMINI_API_KEY = "env-key";
  expect((await request(app).get("/api/settings")).body.hasGeminiKey).toBe(true);
  delete process.env.GEMINI_API_KEY;
  await request(app).put("/api/settings").send({ ...body, geminiKey: "k" });
  await request(app).put("/api/settings").send({ ...body, ollamaModel: "other" });
  expect((await request(app).get("/api/settings")).body.hasGeminiKey).toBe(true);
  await request(app).put("/api/settings").send({ ...body, geminiKey: "" });
  expect((await request(app).get("/api/settings")).body.hasGeminiKey).toBe(false);
});

it("PUT persists and survives new app instance", async () => {
  await request(createApp({ dataDir: dir })).put("/api/settings").send(body).expect(200);
  const res = await request(createApp({ dataDir: dir })).get("/api/settings");
  expect(res.body).toMatchObject(body);
});

it("PUT takes effect without restart via getProvider", async () => {
  const app = createApp({ dataDir: dir });
  await request(app).put("/api/settings").send(body).expect(200);
  const p = await app.locals.ctx.getProvider();
  expect(p.name).toBe("ollama");
  expect(p.model).toBe("o-model");
});

it("PUT rejects invalid input with 422", async () => {
  const app = createApp({ dataDir: dir });
  for (const bad of [
    { ...body, provider: "x" },
    { ...body, geminiModel: "  " },
    { ...body, ollamaUrl: "ftp://x" },
    { ...body, ollamaUrl: "nope" },
  ]) {
    const res = await request(app).put("/api/settings").send(bad);
    expect(res.status).toBe(422);
    expect(res.body.error).toEqual(expect.any(String));
  }
});

it("AiError RATE_LIMIT maps to 429 with retry hint message", async () => {
  const res = await request(appThrowing(new AiError("RATE_LIMIT", "Rate limited.", { retryAfterSec: 30 }))).get("/boom");
  expect(res.status).toBe(429);
  expect(res.headers["retry-after"]).toBe("30");
  expect(res.body.error).toMatchObject({ code: "RATE_LIMIT", retryAfterSec: 30 });
  expect(res.body.error.message).toMatch(/30s/);
});

it("NO_KEY maps to 401 with message telling where to set the key", async () => {
  const res = await request(appThrowing(new AiError("NO_KEY", "no key"))).get("/boom");
  expect(res.status).toBe(401);
  expect(res.body.error.code).toBe("NO_KEY");
  expect(res.body.error.message).toMatch(/Settings/);
  expect(res.body.error.message).toMatch(/GEMINI_API_KEY/);
});

it("maps other AiError codes", async () => {
  for (const [code, status] of [["BAD_KEY", 401], ["BAD_MODEL", 422], ["BAD_OUTPUT", 422], ["NETWORK", 502]] as const) {
    const res = await request(appThrowing(new AiError(code, "m"))).get("/boom");
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
  }
  const bm = await request(appThrowing(new AiError("BAD_MODEL", "m"))).get("/boom");
  expect(bm.body.error.message).toMatch(/Settings/);
});

it("corrupt settings.json: GET returns defaults, PUT overwrites it", async () => {
  fs.writeFileSync(path.join(dir, "settings.json"), '{"provider": "oll');
  const app = createApp({ dataDir: dir });
  const get = await request(app).get("/api/settings");
  expect(get.status).toBe(200);
  expect(get.body.provider).toBe("gemini");
  await request(app).put("/api/settings").send(body).expect(200);
  expect(JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8")).provider).toBe("ollama");
});

it("invalid hand-edited fields fall back to defaults", async () => {
  fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ provider: "ollama", geminiModel: "", ollamaUrl: "zzz" }));
  const res = await request(createApp({ dataDir: dir })).get("/api/settings");
  expect(res.body).toMatchObject({ provider: "ollama", geminiModel: DEFAULT_GEMINI_MODEL, ollamaUrl: "http://127.0.0.1:11434" });
});

it("saved key beats env key", async () => {
  const app = createApp({ dataDir: dir });
  process.env.GEMINI_API_KEY = "env-key";
  expect((await loadSettings(app.locals.ctx.store)).geminiKey).toBe("env-key");
  await request(app).put("/api/settings").send({ ...body, geminiKey: "saved-key" });
  expect((await loadSettings(app.locals.ctx.store)).geminiKey).toBe("saved-key");
});

it("non-AI errors through the central handler", async () => {
  const app = createApp({ dataDir: dir });
  const big = await request(app).put("/api/settings").set("Content-Type", "application/json").send(JSON.stringify({ x: "a".repeat(11 * 1024 * 1024) }));
  expect(big.status).toBe(413);
  expect(big.body).toEqual({ error: "Request body too large" });
  const cs = await request(app).put("/api/settings").set("Content-Type", "application/json; charset=iso-8859-1").send("{}");
  expect(cs.status).toBe(415);
  const bad = await request(app).put("/api/settings").set("Content-Type", "application/json").send('{"geminiKey":"FAKE-SECRET-999",');
  expect(bad.status).toBe(400);
  expect(bad.body).toEqual({ error: "Invalid JSON body" });
  expect(JSON.stringify(bad.body)).not.toContain("FAKE-SECRET");
  expect((await request(app).get("/api/projects/nope")).status).toBe(404);
  expect((await request(appThrowing(new Error("secret detail"))).get("/boom")).body).toEqual({ error: "Internal error" });
});
