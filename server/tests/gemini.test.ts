import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { GeminiProvider } from "../src/ai/gemini.js";
import { OllamaProvider } from "../src/ai/ollama.js";
import { FakeProvider } from "../src/ai/fake.js";
import { createProvider } from "../src/ai/provider.js";

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
  it("403 -> BAD_KEY", async () => {
    const f = vi.fn().mockResolvedValue(json(403, { error: { message: "permission denied" } }));
    await expect(mk(f).generateJson(req)).rejects.toMatchObject({ code: "BAD_KEY" });
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
