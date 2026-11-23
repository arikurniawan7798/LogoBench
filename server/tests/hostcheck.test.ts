import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { request } from "./helpers/request.js";
import { createApp } from "../src/app.js";

// DNS-rebinding / cross-site protection: requests must name this server as Host, and state-changing
// requests carrying an Origin must come from this server's own origin (or the configured dev origin).
const PORT = 3001;
const GOOD = `127.0.0.1:${PORT}`;
const settingsBody = { provider: "ollama", geminiModel: "g", ollamaModel: "o", ollamaUrl: "http://127.0.0.1:11434" };

let dir: string;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-host-"));
  app = createApp({ dataDir: dir, hostCheck: { port: PORT, extraOrigins: ["http://localhost:5173"] } });
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("Host / Origin guard", () => {
  it("a good Host (127.0.0.1, localhost, [::1] on the server port) gets 200", async () => {
    for (const host of [GOOD, `localhost:${PORT}`, `[::1]:${PORT}`, `LOCALHOST:${PORT}`]) {
      const res = await request(app).get("/api/health").set("Host", host);
      expect(res.status, host).toBe(200);
      expect(res.body).toEqual({ ok: true });
    }
  });

  it("a bad Host gets 403 with the JSON error shape", async () => {
    for (const host of ["example.com", `127.0.0.1:${PORT + 1}`, "127.0.0.1", `localhost.evil.com:${PORT}`]) {
      const res = await request(app).get("/api/health").set("Host", host);
      expect(res.status, host).toBe(403);
      expect(typeof res.body.error).toBe("string");
    }
  });

  it("a rebinding-style Host evil.com:<port> cannot read or change data", async () => {
    const list = await request(app).get("/api/projects").set("Host", `evil.com:${PORT}`);
    expect(list.status).toBe(403);
    const put = await request(app).put("/api/settings").set("Host", `evil.com:${PORT}`).send(settingsBody);
    expect(put.status).toBe(403);
    expect(fs.existsSync(path.join(dir, "settings.json"))).toBe(false);
  });

  it("a cross-origin POST/PUT is rejected with 403 even with a good Host", async () => {
    const put = await request(app).put("/api/settings").set("Host", GOOD).set("Origin", "https://attacker.example").send(settingsBody);
    expect(put.status).toBe(403);
    expect(typeof put.body.error).toBe("string");
    const nullOrigin = await request(app).post("/api/projects").set("Host", GOOD).set("Origin", "null").field("name", "x");
    expect(nullOrigin.status).toBe(403);
    const settings = await request(app).get("/api/settings").set("Host", GOOD);
    expect(settings.body.provider).toBe("gemini");
  });

  it("a same-origin PUT is accepted (server origin and the configured dev origin)", async () => {
    const same = await request(app).put("/api/settings").set("Host", GOOD).set("Origin", `http://${GOOD}`).send(settingsBody);
    expect(same.status).toBe(200);
    const dev = await request(app).put("/api/settings").set("Host", GOOD).set("Origin", "http://localhost:5173").send(settingsBody);
    expect(dev.status).toBe(200);
  });

  it("a non-browser POST/PUT with no Origin is accepted", async () => {
    const res = await request(app).put("/api/settings").set("Host", GOOD).send(settingsBody);
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe("ollama");
  });

  it("a cross-origin GET is allowed through (CORS keeps the response unreadable)", async () => {
    const res = await request(app).get("/api/health").set("Host", GOOD).set("Origin", "https://attacker.example");
    expect(res.status).toBe(200);
  });

  it("hostCheck: false disables the guard (tests over the IPC helper)", async () => {
    const open = createApp({ dataDir: dir, hostCheck: false });
    const res = await request(open).get("/api/health").set("Host", "evil.com");
    expect(res.status).toBe(200);
  });

  it("the default (no hostCheck option) is strict", async () => {
    const strict = createApp({ dataDir: dir });
    const res = await request(strict).get("/api/health");
    expect(res.status).toBe(403);
  });
});
