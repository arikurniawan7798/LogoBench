import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { request } from "./helpers/request.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { createApp } from "../src/app.js";
import type { AppContext } from "../src/context.js";
import { buildIdentityZip } from "../src/identity/bundle.js";
import { downloadFont, type FontFetcher } from "../src/identity/fonts.js";
import { escapeHtml } from "../src/identity/page.js";
import crypto from "node:crypto";
import { writeReview } from "../src/review/cache.js";
import { MOCKUP_KINDS } from "../src/mockups/render.js";
import { FOOTER_TEXT } from "../src/framing.js";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#FF0000"/></svg>`;
const WOFF2 = Buffer.concat([Buffer.from("wOF2", "latin1"), Buffer.alloc(60, 1)]);
const REMOTE = /https?:\/\//i;

/** Google-Fonts-shaped CSS: a latin and a latin-ext face per weight, plus a cyrillic one that must be ignored. */
const css = (family: string) => {
  const slug = family.toLowerCase().replace(/ /g, "");
  return [400, 700]
    .map(
      (w) => `/* cyrillic */
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${w};
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/${slug}/v1/cyr-${w}.woff2) format('woff2');
  unicode-range: U+0301, U+0400-045F;
}
/* latin-ext */
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${w};
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/${slug}/v1/ext-${w}.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5;
}
/* latin */
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${w};
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/${slug}/v1/latin-${w}.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+2000-206F;
}`,
    )
    .join("\n");
};

/** Fake Google Fonts: CSS for the css2 endpoint, WOFF2 bytes for gstatic. Records every URL. */
function fakeFonts() {
  const urls: string[] = [];
  const fetcher: FontFetcher = async (url) => {
    urls.push(url);
    const u = new URL(url);
    if (u.hostname === "fonts.googleapis.com") {
      const family = (u.searchParams.get("family") ?? "").split(":")[0];
      return new Response(css(family), { status: 200, headers: { "content-type": "text/css" } });
    }
    if (u.hostname === "fonts.gstatic.com") return new Response(new Uint8Array(WOFF2), { status: 200 });
    return new Response("nope", { status: 404 });
  };
  return { fetcher, urls };
}
const failingFetcher: FontFetcher = async () => {
  throw new TypeError("fetch failed");
};

let dir: string;
let ctx: AppContext;
const entries = (zip: Buffer) => unzipSync(new Uint8Array(zip));
const mk = async (name = "Acme", buf = Buffer.from(SVG), file = "a.svg") => (await ctx.projects.create(ctx, name, { buffer: buf, originalName: file })).id;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "logobench-i-"));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("identity zip", () => {
  it("identity.html contains no remote URLs, and every local asset it references is in the zip", async () => {
    const { fetcher } = fakeFonts();
    ctx = createApp({ hostCheck: false, dataDir: dir, fontFetcher: fetcher }).locals.ctx;
    const id = await mk();
    const { zip, warnings } = await buildIdentityZip(ctx, id);
    expect(warnings).toEqual([]);
    const files = entries(zip);
    const html = strFromU8(files["index.html"]);
    expect(html).not.toMatch(REMOTE);
    expect(html).not.toMatch(/\/\/[a-z0-9.-]+\.[a-z]{2,}/i); // no protocol-relative URLs either
    expect(files["assets/logo.svg"]).toBeDefined();
    for (const k of MOCKUP_KINDS) {
      const png = files[`assets/mockups/${k}.png`];
      expect(png, k).toBeDefined();
      expect(Buffer.from(png.subarray(0, 4)).toString("latin1")).toBe("\x89PNG");
    }
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"|url\('([^']+)'\)/g)].map((m) => m[1] ?? m[2]);
    expect(refs.length).toBeGreaterThan(5);
    for (const ref of refs) {
      expect(ref.startsWith("assets/"), ref).toBe(true);
      expect(files[ref], ref).toBeDefined();
    }
    expect(Object.keys(files).every((n) => /^(index\.html|README\.txt|assets\/[a-z0-9/._-]+)$/.test(n))).toBe(true);
  });

  it("fonts bundled when fetcher returns files: @font-face points at local woff2 files (latin subsets only)", async () => {
    const { fetcher, urls } = fakeFonts();
    ctx = createApp({ hostCheck: false, dataDir: dir, fontFetcher: fetcher }).locals.ctx;
    const id = await mk();
    const files = entries((await buildIdentityZip(ctx, id)).zip);
    const html = strFromU8(files["index.html"]);
    const fonts = Object.keys(files).filter((n) => n.startsWith("assets/fonts/"));
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.every((n) => n.endsWith(".woff2"))).toBe(true);
    expect(fonts.some((n) => n.includes("montserrat"))).toBe(true);
    expect(fonts.some((n) => n.includes("inter"))).toBe(true);
    expect(fonts.some((n) => /cyr/.test(n))).toBe(false);
    for (const f of fonts) expect(Buffer.from(files[f].subarray(0, 4)).toString("latin1")).toBe("wOF2");
    expect(html).toMatch(/@font-face\s*\{[^}]*font-family:\s*'Montserrat'[^}]*url\('assets\/fonts\/[a-z0-9-]+\.woff2'\) format\('woff2'\)/);
    expect(html).toMatch(/@font-face\s*\{[^}]*font-family:\s*'Inter'/);
    // Only the official Google Fonts hosts were contacted; the cyrillic subset was never downloaded.
    expect(urls.every((u) => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u))).toBe(true);
    expect(urls.some((u) => u.includes("cyr-"))).toBe(false);
  });

  it("font download failure falls back to the system stack with a warning; zip still built", async () => {
    ctx = createApp({ hostCheck: false, dataDir: dir, fontFetcher: failingFetcher }).locals.ctx;
    const id = await mk();
    const { zip, warnings } = await buildIdentityZip(ctx, id);
    expect(warnings.join(" ")).toMatch(/Montserrat.*system font/i);
    const files = entries(zip);
    const html = strFromU8(files["index.html"]);
    expect(Object.keys(files).some((n) => n.startsWith("assets/fonts/"))).toBe(false);
    expect(html).not.toContain("@font-face");
    expect(html).toMatch(/font-family:\s*'Montserrat',[^;]*sans-serif/);
    expect(html).toMatch(/could not be downloaded/i);
    expect(html).not.toMatch(REMOTE);
    expect(strFromU8(files["README.txt"])).toMatch(/could not be downloaded/i);
    expect(strFromU8(files["README.txt"])).toMatch(/assets\/logo\.\*\s+The logo: the cleaned SVG/);
    expect(strFromU8(files["README.txt"])).not.toMatch(/as uploaded\.$/m);
    expect(files["assets/mockups/website.png"]).toBeDefined();
  });

  it("downloaded fonts are cached so a later export works offline", async () => {
    const { fetcher, urls } = fakeFonts();
    let online = true;
    const toggled: FontFetcher = (u, init) => (online ? fetcher(u, init) : failingFetcher(u, init));
    ctx = createApp({ hostCheck: false, dataDir: dir, fontFetcher: toggled }).locals.ctx;
    const id = await mk();
    await buildIdentityZip(ctx, id);
    const before = urls.length;
    online = false;
    const { zip, warnings } = await buildIdentityZip(ctx, id);
    expect(warnings).toEqual([]);
    expect(urls.length).toBe(before);
    expect(Object.keys(entries(zip)).some((n) => n.startsWith("assets/fonts/"))).toBe(true);
  });

  it("escapes the project name and AI text; no raw markup or remote URLs reach the page", async () => {
    const { fetcher } = fakeFonts();
    ctx = createApp({ hostCheck: false, dataDir: dir, fontFetcher: fetcher }).locals.ctx;
    const evil = `</title><script>alert(1)</script> https://evil.example "x' & ../../x`;
    const id = await mk(evil);
    const dim = { score: 7, reason: `<img src=x onerror=alert(2)> see http://evil.example/a` };
    await writeReview(ctx, id, {
      key: `${crypto.createHash("sha256").update(Buffer.from(SVG)).digest("hex")}|k`,
      createdAt: new Date().toISOString(),
      result: {
        scores: { readability: dim, originality: dim, balance: dim, scalability: dim, misinterpretation: dim },
        personality: { presence: "<b>bold</b>", attitude: "a", formality: "f", style: "s", tone: "t", positioning: "p" },
        summary: `Nice <script>alert(3)</script> https://evil.example`,
      },
    });
    const files = entries((await buildIdentityZip(ctx, id)).zip);
    const html = strFromU8(files["index.html"]);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img src=x/i);
    expect(html).not.toContain("<b>bold</b>");
    expect(html).not.toMatch(REMOTE);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;");
    expect(html).toContain("Nice &lt;script&gt;");
    // Zip entry names never derive from the project name.
    expect(Object.keys(files).some((n) => n.includes("..") || n.includes("evil"))).toBe(false);
  });

  it("frames the AI scores as feedback: a caption under the review heading reuses the app's footer text", async () => {
    const { fetcher } = fakeFonts();
    ctx = createApp({ hostCheck: false, dataDir: dir, fontFetcher: fetcher }).locals.ctx;
    const id = await mk("Acme");
    const dim = { score: 8, reason: "Clear." };
    await writeReview(ctx, id, {
      key: `${crypto.createHash("sha256").update(Buffer.from(SVG)).digest("hex")}|k`,
      createdAt: new Date().toISOString(),
      result: {
        scores: { readability: dim, originality: dim, balance: dim, scalability: dim, misinterpretation: dim },
        personality: { presence: "p", attitude: "a", formality: "f", style: "s", tone: "t", positioning: "p" },
        summary: "Solid.",
      },
    });
    const html = strFromU8(entries((await buildIdentityZip(ctx, id)).zip)["index.html"]);
    const section = html.slice(html.indexOf("<h2>Logo review</h2>"));
    const caption = `<p class="caption">${escapeHtml(FOOTER_TEXT)}</p>`;
    expect(section.startsWith("<h2>Logo review</h2>")).toBe(true);
    expect(section.slice("<h2>Logo review</h2>".length).trimStart().startsWith(caption)).toBe(true);
    expect(section.indexOf(caption)).toBeLessThan(section.indexOf('<table class="scores">'));
    expect(FOOTER_TEXT).toMatch(/not a final judgment/);
    expect(html).not.toMatch(REMOTE);
  });

  it("raster logos are bundled with their own extension", async () => {
    const { fetcher } = fakeFonts();
    ctx = createApp({ hostCheck: false, dataDir: dir, fontFetcher: fetcher }).locals.ctx;
    const png = (await import("sharp")).default;
    const buf = await png({ create: { width: 40, height: 20, channels: 3, background: { r: 0, g: 0, b: 255 } } }).png().toBuffer();
    const id = await mk("Blue", buf, "b.png");
    const files = entries((await buildIdentityZip(ctx, id)).zip);
    expect(files["assets/logo.png"]).toBeDefined();
    expect(strFromU8(files["index.html"])).toContain('src="assets/logo.png"');
  });

  it("escapeHtml escapes markup characters and slashes", () => {
    expect(escapeHtml(`<a href="x">'&'</a> https://e`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;&#47;a&gt; https:&#47;&#47;e");
  });
});

describe("downloadFont", () => {
  it("returns woff2 files with weight/style metadata from the latin subsets", async () => {
    const { fetcher, urls } = fakeFonts();
    const files = await downloadFont("Inter", { fetcher });
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => /^inter-[a-z0-9-]+\.woff2$/.test(f.file) && f.bytes.subarray(0, 4).toString("latin1") === "wOF2")).toBe(true);
    expect(new Set(files.map((f) => f.weight))).toEqual(new Set(["400", "700"]));
    expect(urls[0]).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?family=Inter:wght@400;700&display=swap$/);
  });

  it("sends a woff2-capable User-Agent and a timeout signal", async () => {
    const seen: RequestInit[] = [];
    const { fetcher } = fakeFonts();
    await downloadFont("Inter", { fetcher: (u, init) => (seen.push(init ?? {}), fetcher(u, init)) });
    const headers = new Headers(seen[0].headers);
    expect(headers.get("user-agent")).toMatch(/Chrome\/\d+/);
    expect(seen.every((i) => i.signal instanceof AbortSignal)).toBe(true);
  });

  it("rejects bad family names without fetching", async () => {
    const { fetcher, urls } = fakeFonts();
    await expect(downloadFont("Inter&family=../x", { fetcher })).rejects.toThrow(/family/i);
    expect(urls).toEqual([]);
  });

  it("never follows font URLs outside fonts.gstatic.com", async () => {
    const urls: string[] = [];
    const fetcher: FontFetcher = async (url) => {
      urls.push(url);
      return new Response(`/* latin */ @font-face { font-family: 'Inter'; font-style: normal; font-weight: 400; src: url(http://127.0.0.1:9/x.woff2) format('woff2'); }`, { status: 200 });
    };
    await expect(downloadFont("Inter", { fetcher })).rejects.toThrow();
    expect(urls.length).toBe(1);
  });

  it("rejects non-woff2 bytes, oversized files and HTTP errors", async () => {
    const { fetcher } = fakeFonts();
    const notWoff: FontFetcher = async (u, i) => (u.includes("gstatic") ? new Response("<html>", { status: 200 }) : fetcher(u, i));
    await expect(downloadFont("Inter", { fetcher: notWoff })).rejects.toThrow(/woff2/i);
    const huge: FontFetcher = async (u, i) => (u.includes("gstatic") ? new Response(new Uint8Array(Buffer.concat([WOFF2, Buffer.alloc(3 * 1024 * 1024)]))) : fetcher(u, i));
    await expect(downloadFont("Inter", { fetcher: huge })).rejects.toThrow(/too large/i);
    const err: FontFetcher = async () => new Response("x", { status: 500 });
    await expect(downloadFont("Inter", { fetcher: err })).rejects.toThrow(/500/);
  });
});

describe("GET /api/projects/:id/identity.zip", () => {
  it("returns the identity zip as an attachment", async () => {
    const { fetcher } = fakeFonts();
    const app = createApp({ hostCheck: false, dataDir: dir, fontFetcher: fetcher });
    ctx = app.locals.ctx;
    const id = await mk("Acme Co");
    const res = await request(app)
      .get(`/api/projects/${id}/identity.zip`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toContain('filename="Acme Co-identity.zip"');
    expect(entries(res.body as Buffer)["index.html"]).toBeDefined();
  });

  it("404 for an unknown project", async () => {
    const app = createApp({ hostCheck: false, dataDir: dir, fontFetcher: failingFetcher });
    const res = await request(app).get(`/api/projects/does-not-exist/identity.zip`);
    expect(res.status).toBe(404);
  });
});
