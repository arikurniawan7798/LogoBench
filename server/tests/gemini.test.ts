import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { GeminiProvider } from "../src/ai/gemini.js";
import { OllamaProvider } from "../src/ai/ollama.js";
import { FakeProvider } from "../src/ai/fake.js";
import { createProvider } from "../src/ai/provider.js";
import { DEFAULT_GEMINI_MODEL } from "../src/config.js";

// fetch mock that never resolves but honours AbortSignal, like real fetch
const hang = () =>
  vi.fn((_u: any, init: any) => new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(init.signal.reason))));

const schema = z.object({ score: z.number() });
const KEY = "SECRET-KEY-123";
const req = { system: "sys", prompt: "p", images: [{ mime: "image/png", bytes: Buffer.from("hi") }], schema };
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const ok = (text: string) => json(200, { candidates: [{ content: { parts: [{ text }] } }] });
const mk = (fetchFn: any, key: string | null = KEY) =>
  new GeminiProvider({ model: "m", apiKey: key ?? undefined, fetch: fetchFn, sleep: async () => {}, retries: 0 });

describe("GeminiProvider", () => {
  it("no key configured -> NO_KEY before any network call", async () => {
    const f = vi.fn();
    await expect(mk(f, null).generateJson(req)).rejects.toMatchObject({ code: "NO_KEY" });
    expect(f).not.toHaveBeenCalled();
  });
  it("sends key in header, image inline, json mime type", async () => {
    const f = vi.fn().mockResolvedValue(ok('{"score": 4}'));
    await expect(mk(f).generateJson(req)).resolves.toEqual({ score: 4 });
    const [url, init] = f.mock.calls[0];
    expect(String(url)).not.toContain(KEY);
    expect(String(url)).toContain("/models/m:generateContent");
    expect(init.headers["x-goog-api-key"]).toBe(KEY);
    const body = JSON.parse(init.body);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    const parts = body.contents[0].parts;
    expect(parts.some((p: any) => p.inlineData?.mimeType === "image/png" && p.inlineData.data === Buffer.from("hi").toString("base64"))).toBe(true);
  });
  it("429 -> RATE_LIMIT with retryAfterSec from header", async () => {
    const f = vi.fn().mockResolvedValue(json(429, { error: { message: "quota" } }, { "retry-after": "17" }));
    await expect(mk(f).generateJson(req)).rejects.toMatchObject({ code: "RATE_LIMIT", retryAfterSec: 17 });
  });
  it("429 -> retryAfterSec from Gemini RetryInfo", async () => {
    const body = { error: { message: "quota", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "32s" }] } };
    const f = vi.fn().mockResolvedValue(json(429, body));
    await expect(mk(f).generateJson(req)).rejects.toMatchObject({ code: "RATE_LIMIT", retryAfterSec: 32 });
  });
  it("400 API key invalid -> BAD_KEY without leaking the key", async () => {
    const f = vi.fn().mockResolvedValue(json(400, { error: { message: `API key not valid ${KEY}` } }));
    const err = await mk(f).generateJson(req).catch((e) => e);
    expect(err.code).toBe("BAD_KEY");
    expect(err.message).not.toContain(KEY);
  });
  it("403 about the API key -> BAD_KEY", async () => {
    const f = vi.fn().mockResolvedValue(json(403, { error: { message: "Method doesn't allow unregistered callers (API key missing)" } }));
    await expect(mk(f).generateJson(req)).rejects.toMatchObject({ code: "BAD_KEY" });
  });
  it("other 403 -> BAD_MODEL (not retried) with sanitized message", async () => {
    const f = vi.fn().mockResolvedValue(json(403, { error: { message: `model access denied ${KEY}` } }));
    const err = await mk(f).generateJson(req).catch((e) => e);
    expect(err.code).toBe("BAD_MODEL");
    expect(err.message).not.toContain(KEY);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("404 -> BAD_MODEL with a single fetch call, even with retries", async () => {
    const f = vi.fn().mockResolvedValue(json(404, { error: { message: "model not found" } }));
    const p = new GeminiProvider({ model: "nope", apiKey: KEY, fetch: f as any, sleep: async () => {}, retries: 2 });
    const err = await p.generateJson(req).catch((e) => e);
    expect(err.code).toBe("BAD_MODEL");
    expect(err.message).toMatch(/Settings/);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("timeout aborts and surfaces as NETWORK", async () => {
    const f = hang();
    const p = new GeminiProvider({ model: "m", apiKey: KEY, fetch: f as any, sleep: async () => {}, retries: 0, timeoutMs: 20 });
    await expect(p.generateJson(req)).rejects.toMatchObject({ code: "NETWORK", message: expect.stringMatching(/timed out/) });
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("retryAfterSec 3600 fails fast without sleeping, hint preserved", async () => {
    const sleep = vi.fn(async () => {});
    const f = vi.fn().mockResolvedValue(json(429, {}, { "retry-after": "3600" }));
    const p = new GeminiProvider({ model: "m", apiKey: KEY, fetch: f as any, sleep, retries: 2 });
    await expect(p.generateJson(req)).rejects.toMatchObject({ code: "RATE_LIMIT", retryAfterSec: 3600 });
    expect(sleep).not.toHaveBeenCalled();
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("retryAfterSec 2 sleeps 2000", async () => {
    const sleep = vi.fn(async () => {});
    const f = vi.fn().mockResolvedValueOnce(json(429, {}, { "retry-after": "2" })).mockResolvedValueOnce(ok('{"score":1}'));
    const p = new GeminiProvider({ model: "m", apiKey: KEY, fetch: f as any, sleep, retries: 2, baseMs: 100 });
    await p.generateJson(req);
    expect(sleep).toHaveBeenCalledWith(2000);
  });
  it("503 high demand: retried with default 2s/4s/8s backoff, then a clear NETWORK message", async () => {
    const sleep = vi.fn(async () => {});
    const f = vi.fn().mockImplementation(async () => json(503, { error: { message: "This model is currently experiencing high demand." } }));
    const p = new GeminiProvider({ model: "m", apiKey: KEY, fetch: f as any, sleep });
    await expect(p.generateJson(req)).rejects.toMatchObject({ code: "NETWORK", message: expect.stringMatching(/overloaded.*try again/i) });
    expect(f).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 4000, 8000]);
  });
  it("default model is gemini-3.6-flash", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.6-flash");
  });
  it("fetch failure -> NETWORK", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(mk(f).generateJson(req)).rejects.toMatchObject({ code: "NETWORK" });
  });
  it("retries once on bad output then BAD_OUTPUT", async () => {
    const f = vi.fn().mockImplementation(async () => ok("nope"));
    await expect(mk(f).generateJson(req)).rejects.toMatchObject({ code: "BAD_OUTPUT" });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("backs off on 429 then succeeds", async () => {
    const f = vi.fn().mockResolvedValueOnce(json(429, {})).mockResolvedValueOnce(ok('{"score":1}'));
    const p = new GeminiProvider({ model: "m", apiKey: KEY, fetch: f as any, sleep: async () => {}, retries: 2 });
    await expect(p.generateJson(req)).resolves.toEqual({ score: 1 });
  });
});

describe("OllamaProvider", () => {
  it("posts to /api/chat with base64 images and format json", async () => {
    const f = vi.fn().mockResolvedValue(json(200, { message: { content: '{"score": 2}' } }));
    const p = new OllamaProvider({ model: "llava", url: "http://h:1/", fetch: f as any, sleep: async () => {}, retries: 0 });
    await expect(p.generateJson(req)).resolves.toEqual({ score: 2 });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://h:1/api/chat");
    const body = JSON.parse(init.body);
    expect(body.format).toBe("json");
    expect(body.stream).toBe(false);
    expect(body.messages[1].images).toEqual([Buffer.from("hi").toString("base64")]);
  });
  it("404 -> BAD_MODEL telling the user to ollama pull, one call", async () => {
    const f = vi.fn().mockResolvedValue(json(404, { error: "model not found" }));
    const p = new OllamaProvider({ model: "llava", url: "http://h:1", fetch: f as any, sleep: async () => {}, retries: 2 });
    const err = await p.generateJson(req).catch((e) => e);
    expect(err.code).toBe("BAD_MODEL");
    expect(err.message).toContain("ollama pull llava");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("timeout -> NETWORK", async () => {
    const f = hang();
    const p = new OllamaProvider({ model: "llava", url: "http://h:1", fetch: f as any, sleep: async () => {}, retries: 0, timeoutMs: 20 });
    await expect(p.generateJson(req)).rejects.toMatchObject({ code: "NETWORK", message: expect.stringMatching(/timed out/) });
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("connection failure -> NETWORK", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const p = new OllamaProvider({ model: "llava", url: "http://h:1", fetch: f as any, sleep: async () => {}, retries: 0 });
    await expect(p.generateJson(req)).rejects.toMatchObject({ code: "NETWORK" });
  });
});

describe("createProvider / FakeProvider", () => {
  const base = { geminiModel: "g", ollamaModel: "o", ollamaUrl: "http://x" };
  it("chooses by settings", () => {
    expect(createProvider({ ...base, provider: "gemini" }).name).toBe("gemini");
    expect(createProvider({ ...base, provider: "ollama" }).name).toBe("ollama");
  });
  it("FakeProvider validates queued responses and records calls", async () => {
    const fake = new FakeProvider([{ score: 1 }, { score: "bad" }]);
    await expect(fake.generateJson(req)).resolves.toEqual({ score: 1 });
    await expect(fake.generateJson(req)).rejects.toMatchObject({ code: "BAD_OUTPUT" });
    await expect(fake.generateJson(req)).rejects.toThrow(/no queued/i);
    expect(fake.calls).toHaveLength(3);
    expect(fake.calls[0].prompt).toBe("p");
  });
});
