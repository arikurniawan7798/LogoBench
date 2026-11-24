import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { parseModelJson, withBackoff, generateValidated } from "../src/ai/structured.js";
import { AiError } from "../src/ai/provider.js";

const schema = z.object({ score: z.number().min(0).max(10), note: z.string() });

describe("parseModelJson", () => {
  it("accepts fenced json", () => {
    expect(parseModelJson('```json\n{"score": 7, "note": "ok"}\n```', schema)).toEqual({ score: 7, note: "ok" });
  });
  it("accepts leading prose", () => {
    expect(parseModelJson('Sure! Here you go: {"score": 3, "note": "a {b} c"} Hope it helps.', schema)).toEqual({
      score: 3,
      note: "a {b} c",
    });
  });
  it("rejects score 11 with BAD_OUTPUT", () => {
    expect(() => parseModelJson('{"score": 11, "note": "x"}', schema)).toThrowError(expect.objectContaining({ code: "BAD_OUTPUT" }));
  });
  it("rejects missing field", () => {
    expect(() => parseModelJson('{"score": 5}', schema)).toThrowError(expect.objectContaining({ code: "BAD_OUTPUT" }));
  });
  it("rejects non-json", () => {
    expect(() => parseModelJson("no json here", schema)).toThrowError(expect.objectContaining({ code: "BAD_OUTPUT" }));
  });
});

describe("generateValidated", () => {
  it("retries once on BAD_OUTPUT then throws AiError BAD_OUTPUT", async () => {
    const raw = vi.fn().mockResolvedValue("garbage");
    await expect(generateValidated(raw, schema)).rejects.toMatchObject({ code: "BAD_OUTPUT" });
    expect(raw).toHaveBeenCalledTimes(2);
  });
  it("succeeds on the retry", async () => {
    const raw = vi.fn().mockResolvedValueOnce("garbage").mockResolvedValueOnce('{"score":1,"note":"n"}');
    await expect(generateValidated(raw, schema)).resolves.toEqual({ score: 1, note: "n" });
  });
});

describe("withBackoff", () => {
  it("retries 429 twice then succeeds", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new AiError("RATE_LIMIT", "slow", { retryAfterSec: 2 }))
      .mockRejectedValueOnce(new AiError("NETWORK", "down"))
      .mockResolvedValueOnce("ok");
    await expect(withBackoff(fn, { retries: 2, baseMs: 100, sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 2000);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });
  it("fails fast on a long retry hint, preserving it", async () => {
    const sleep = vi.fn();
    const fn = vi.fn().mockRejectedValue(new AiError("RATE_LIMIT", "x", { retryAfterSec: 3600 }));
    await expect(withBackoff(fn, { retries: 3, baseMs: 1, sleep })).rejects.toMatchObject({ code: "RATE_LIMIT", retryAfterSec: 3600 });
    expect(sleep).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("does not retry BAD_MODEL", async () => {
    const fn = vi.fn().mockRejectedValue(new AiError("BAD_MODEL", "x"));
    await expect(withBackoff(fn, { retries: 3, baseMs: 1, sleep: async () => {} })).rejects.toMatchObject({ code: "BAD_MODEL" });
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("does not retry other codes", async () => {
    const fn = vi.fn().mockRejectedValue(new AiError("BAD_KEY", "no"));
    await expect(withBackoff(fn, { retries: 3, baseMs: 1, sleep: async () => {} })).rejects.toMatchObject({ code: "BAD_KEY" });
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("gives up after retries", async () => {
    const fn = vi.fn().mockRejectedValue(new AiError("RATE_LIMIT", "x"));
    await expect(withBackoff(fn, { retries: 1, baseMs: 1, sleep: async () => {} })).rejects.toMatchObject({ code: "RATE_LIMIT" });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
