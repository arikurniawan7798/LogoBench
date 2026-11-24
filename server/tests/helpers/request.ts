import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import supertest from "supertest";
import { afterAll } from "vitest";

/**
 * Drop-in for `supertest(app)` that serves the app over a local IPC socket (a Windows named pipe, or a
 * Unix domain socket elsewhere) instead of an ephemeral 127.0.0.1 TCP port.
 *
 * Why: on the Windows dev machine (Node 24.15), a process opening loopback TCP connections dies at
 * random with exit code 0xC0000409 (silent native fast-fail: no JS error, no stderr), about once per
 * 7,000-20,000 new connections. This reproduces without vitest, sharp or app code; HTTP over a named
 * pipe (or over one kept-alive TCP connection) never crashed in 150,000 requests. Plain
 * `supertest(app)` opens a fresh TCP listener + connection per request, so in vitest it showed up as
 * "Worker exited unexpectedly" with a whole test file missing (~15% of runs). See Task 12c report.
 *
 * One server per app instance, kept for the whole test file and closed in afterAll.
 */
type Listener = http.RequestListener;

const served = new Map<Listener, { server: http.Server; url: string }>();
let seq = 0;

function socketPath(): string {
  const name = `logobench-test-${process.pid}-${++seq}`;
  // Forward slashes are valid for Windows pipe names and survive superagent's "%2F" -> "/" decoding.
  return process.platform === "win32" ? `//./pipe/${name}` : path.join(os.tmpdir(), `${name}.sock`);
}

function urlFor(app: Listener): string {
  let entry = served.get(app);
  if (!entry) {
    const where = socketPath();
    const server = http.createServer(app);
    // Binding an IPC path is synchronous in a non-cluster process, so requests can be made right away.
    server.listen(where);
    if (!server.listening) throw new Error(`test server did not bind ${where}`);
    entry = { server, url: `http+unix://${where.replace(/\//g, "%2F")}` };
    served.set(app, entry);
  }
  return entry.url;
}

export function request(app: Listener) {
  return supertest(urlFor(app));
}

afterAll(async () => {
  const all = [...served.values()];
  served.clear();
  await Promise.all(
    all.map(({ server }) => new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    })),
  );
  if (process.platform !== "win32") {
    for (const { url } of all) fs.rmSync(decodeURIComponent(url.slice("http+unix://".length)), { force: true });
  }
});
