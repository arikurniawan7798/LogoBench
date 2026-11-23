import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * DNS-rebinding and cross-site request guard for a server that is only meant to be reached on loopback.
 *
 * - Host must be 127.0.0.1, localhost or [::1] on the server's port. A rebinding page (evil.com resolving to
 *   127.0.0.1) still sends `Host: evil.com:<port>`, so it is refused before any router runs.
 * - State-changing methods (anything but GET/HEAD/OPTIONS) that carry an Origin must come from one of those
 *   hosts (or an explicitly allowed origin, e.g. the Vite dev server). Browsers always send Origin on
 *   cross-site POST/PUT/DELETE, including "simple" multipart/text-plain ones; non-browser clients (curl,
 *   scripts) send none and are allowed.
 */
export type HostCheckOptions = { port: number; extraOrigins?: string[] };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const LOOPBACK_NAMES = ["127.0.0.1", "localhost", "[::1]"];

export function hostGuard(opts: HostCheckOptions): RequestHandler {
  const hosts = new Set<string>();
  for (const name of LOOPBACK_NAMES) {
    hosts.add(`${name}:${opts.port}`);
    if (opts.port === 80) hosts.add(name); // browsers omit the default port
  }
  const origins = new Set<string>([...hosts].map((h) => `http://${h}`));
  for (const o of opts.extraOrigins ?? []) origins.add(o.toLowerCase().replace(/\/+$/, ""));

  return (req: Request, res: Response, next: NextFunction) => {
    const host = (req.headers.host ?? "").toLowerCase();
    if (!hosts.has(host)) {
      res.status(403).json({ error: `Forbidden: unexpected Host header. Open LogoBench at http://127.0.0.1:${opts.port}.` });
      return;
    }
    if (!SAFE_METHODS.has(req.method)) {
      const origin = req.headers.origin;
      if (origin !== undefined && !origins.has(origin.toLowerCase())) {
        res.status(403).json({ error: "Forbidden: cross-origin request refused." });
        return;
      }
    }
    next();
  };
}
