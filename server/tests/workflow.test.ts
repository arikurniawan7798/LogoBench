import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { request } from "./helpers/request.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { AiError, type GenerateRequest, type Provider } from "../src/ai/provider.js";
import { FakeProvider } from "../src/ai/fake.js";
import type { AppContext } from "../src/context.js";
import { runCreateIdentity, STEPS, type StepEvent } from "../src/identity/workflow.js";
import type { FontFetcher } from "../src/identity/fonts.js";
import { getType } from "../src/type/pairings.js";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#FF0000"/><rect width="20" height="20" fill="#0000FF"/></svg>`;
const noFonts: FontFetcher = async () => {
  throw new TypeError("offline");
};
const dim = { score: 7, reason: "ok" };
const REVIEW = {
  scores: { readability: dim, originality: dim, balance: dim, scalability: dim, misinterpretation: dim },
  personality: { presence: "bold", attitude: "friendly", formality: "casual", style: "modern", tone: "warm", positioning: "mid" },
  summary: "Solid.",
};
const COLORS = { main: "#FF0000", swatches: [{ hex: "#FF0000", name: "Signal Red" }], summary: "Warm." };
const TYPE = { heading: "Playfair Display", body: "Inter" };

/** Always throws the given AI error; counts calls. */
class FailingProvider implements Provider {
  readonly name = "failing";
  readonly model = "failing-model";
  calls = 0;
  constructor(private make: () => AiError) {}
  async generateJson<T>(_req: GenerateRequest<T>): Promise<T> {
    this.calls++;
    throw this.make();
  }
}

let dir: string;
let ctx: AppContext;
const setup = (provider: Provider, fontFetcher: FontFetcher = noFonts) => {
  const app = createApp({ hostCheck: false, dataDir: dir, provider, fontFetcher });
  ctx = app.locals.ctx;
  return app;
};
const mk = async () => (await ctx.projects.create(ctx, "Acme", { buffer: Buffer.from(SVG), originalName: "a.svg" })).id;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "logobench-w-"));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("runCreateIdentity", () => {
  it("all steps ok with a working provider; results saved", async () => {
    const provider = new FakeProvider([REVIEW, COLORS, TYPE]);
    setup(provider);
    const id = await mk();
    const results = await runCreateIdentity(ctx, id, () => {});
    expect(results.map((r) => r.step)).toEqual([...STEPS]);
    expect(results.map((r) => r.status)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(provider.callCount).toBe(3);
    expect((await getType(ctx, id)).heading).toBe("Playfair Display");
    const colors = await ctx.store.readJson<{ main: { name?: string } }>(`projects/${id}/colors.json`);
    expect(colors?.main.name).toBe("Signal Red");
  });

  it("provider RATE_LIMIT on review marks review failed, still runs colors (deterministic fallback), type fallback, mockups, identity", async () => {
    const provider = new FailingProvider(() => new AiError("RATE_LIMIT", "Rate limited by Gemini."));
    setup(provider);
    const id = await mk();
    const events: StepEvent[] = [];
    const results = await runCreateIdentity(ctx, id, (e) => events.push(e));
    const by = Object.fromEntries(results.map((r) => [r.step, r]));
    expect(by.review.status).toBe("failed");
    expect(by.review.error).toEqual({ code: "RATE_LIMIT", message: expect.stringMatching(/rate limited/i) });
    expect(by.colors.status).toBe("failed");
    expect(by.colors.error?.code).toBe("RATE_LIMIT");
    expect(by.colors.note).toMatch(/extracted/i);
    expect(by.type.status).toBe("failed");
    expect(by.type.note).toMatch(/default/i);
    expect(by.mockups.status).toBe("ok");
    expect(by.identity.status).toBe("ok");
    expect(provider.calls).toBe(3);
    // Deterministic fallbacks were saved so the identity has real colors and curated fonts.
    const colors = await ctx.store.readJson<{ main: { hex: string } }>(`projects/${id}/colors.json`);
    expect(colors?.main.hex).toMatch(/^#[0-9A-F]{6}$/);
    expect(await ctx.store.readJson(`projects/${id}/type.json`)).toEqual(await getType(ctx, id));
    expect(events.at(-1)).toEqual({ type: "done", results });
  });

  it("fallbacks never overwrite a palette or type system the user saved", async () => {
    setup(new FailingProvider(() => new AiError("NETWORK", "Network error.")));
    const id = await mk();
    const mine = { heading: "Lora", body: "Inter", scale: (await getType(ctx, id)).scale };
    await ctx.store.writeJson(`projects/${id}/type.json`, mine);
    const results = await runCreateIdentity(ctx, id, () => {});
    expect(results.find((r) => r.step === "type")?.note).toMatch(/kept/i);
    expect((await getType(ctx, id)).heading).toBe("Lora");
  });

  it("steps run in order, never concurrently", async () => {
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const inner = new FakeProvider([REVIEW, COLORS, TYPE]);
    const slow: Provider = {
      name: "slow",
      model: "slow-model",
      async generateJson<T>(req: GenerateRequest<T>): Promise<T> {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 15));
        try {
          return await inner.generateJson(req);
        } finally {
          active--;
        }
      },
    };
    setup(slow);
    const id = await mk();
    const events: StepEvent[] = [];
    await runCreateIdentity(ctx, id, (e) => {
      events.push(e);
      if (e.type === "start") order.push(`+${e.step}`);
      if (e.type === "end") order.push(`-${e.step}`);
    });
    expect(maxActive).toBe(1);
    expect(order).toEqual(STEPS.flatMap((s) => [`+${s}`, `-${s}`]));
    expect(events.filter((e) => e.type === "done")).toHaveLength(1);
  });

  it("NO_KEY marks AI steps failed with a message pointing to Settings", async () => {
    setup(new FailingProvider(() => new AiError("NO_KEY", "No API key.")));
    const id = await mk();
    const results = await runCreateIdentity(ctx, id, () => {});
    for (const step of ["review", "colors", "type"]) {
      const r = results.find((x) => x.step === step)!;
      expect(r.status).toBe("failed");
      expect(r.error?.code).toBe("NO_KEY");
      expect(r.error?.message).toMatch(/Settings/);
    }
    expect(results.find((r) => r.step === "mockups")?.status).toBe("ok");
    expect(results.find((r) => r.step === "identity")?.status).toBe("ok");
  });

  it("does not retry a rate-limited step itself (the provider adapter owns backoff): one call, reported, later steps run", async () => {
    const inner = new FakeProvider([COLORS, TYPE]);
    let calls = 0;
    const flaky: Provider = {
      name: "flaky",
      model: "flaky-model",
      async generateJson<T>(req: GenerateRequest<T>): Promise<T> {
        calls++;
        if (calls === 1) throw new AiError("RATE_LIMIT", "Slow down.", { retryAfterSec: 2 });
        return inner.generateJson(req);
      },
    };
    setup(flaky);
    const id = await mk();
    const results = await runCreateIdentity(ctx, id, () => {});
    expect(calls).toBe(3); // review once (failed, not retried), then colors and type
    expect(results[0]).toMatchObject({ step: "review", status: "failed", error: { code: "RATE_LIMIT" } });
    expect(results.slice(1).map((r) => r.status)).toEqual(["ok", "ok", "ok", "ok"]);
  });

  it("unknown project throws before any step runs", async () => {
    setup(new FakeProvider());
    const events: StepEvent[] = [];
    await expect(runCreateIdentity(ctx, "nope", (e) => events.push(e))).rejects.toThrow(/not found/i);
    expect(events).toEqual([]);
  });
});

describe("POST /api/projects/:id/create-identity", () => {
  it("streams step events as data: lines and ends with the summary", async () => {
    const app = setup(new FailingProvider(() => new AiError("NO_KEY", "No API key.")));
    const id = await mk();
    const res = await request(app)
      .post(`/api/projects/${id}/create-identity`)
      .buffer(true)
      .parse((r, cb) => {
        let s = "";
        r.setEncoding("utf8");
        r.on("data", (c: string) => (s += c));
        r.on("end", () => cb(null, s));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/event-stream/);
    expect(res.headers["cache-control"]).toMatch(/no-cache/);
    const text = res.body as string;
    expect(text.endsWith("\n\n")).toBe(true);
    const events = text.trim().split("\n\n").map((chunk) => {
      expect(chunk.startsWith("data: ")).toBe(true);
      return JSON.parse(chunk.slice(6)) as StepEvent;
    });
    expect(events.filter((e) => e.type === "start").map((e) => (e as { step: string }).step)).toEqual([...STEPS]);
    const done = events.at(-1)!;
    expect(done.type).toBe("done");
    if (done.type !== "done") return;
    expect(done.results.map((r) => r.status)).toEqual(["failed", "failed", "failed", "ok", "ok"]);
    expect(done.results[0].error?.message).toMatch(/Settings/);
  });

  it("404 JSON for an unknown project (no stream started)", async () => {
    const app = setup(new FakeProvider());
    const res = await request(app).post(`/api/projects/nope/create-identity`);
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/json/);
  });

  it("409 while a workflow is already running for the project", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const inner = new FakeProvider([REVIEW, COLORS, TYPE]);
    const blocking: Provider = {
      name: "blocking",
      model: "blocking-model",
      async generateJson<T>(req: GenerateRequest<T>): Promise<T> {
        await gate;
        return inner.generateJson(req);
      },
    };
    const app = setup(blocking);
    const id = await mk();
    const running = runCreateIdentity(ctx, id, () => {});
    const res = await request(app).post(`/api/projects/${id}/create-identity`);
    expect(res.status).toBe(409);
    release();
    await running;
  });
});
