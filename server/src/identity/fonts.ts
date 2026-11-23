import { loadFonts } from "../type/pairings.js";

/** Same shape as global fetch, so tests can inject a fake and production uses `fetch`. */
export type FontFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type FontFile = { file: string; bytes: Buffer; weight: string; style: "normal" | "italic"; unicodeRange?: string };

export class FontDownloadError extends Error {}

const CSS_HOST = "https://fonts.googleapis.com/css2";
const FILE_PREFIX = "https://fonts.gstatic.com/";
// Google Fonts serves WOFF2 only to browsers it recognizes; a current desktop Chrome UA gets woff2 + unicode-range subsets.
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT_MS = 15_000;
const MAX_CSS_BYTES = 256 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_FAMILY_BYTES = 8 * 1024 * 1024;
const MAX_FACES = 16;
const SUBSETS = new Set(["latin", "latin-ext"]);
const WANTED_WEIGHTS = [400, 700];

export const FAMILY_RE = /^[A-Za-z0-9 ]{1,60}$/;
export const fontSlug = (family: string) => family.trim().toLowerCase().replace(/ +/g, "-");

/** Read a response body, aborting once it exceeds `max` bytes. */
async function readCapped(res: Response, max: number, what: string): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) throw new FontDownloadError(`${what} too large`);
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new FontDownloadError(`${what} too large`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function get(fetcher: FontFetcher, url: string, max: number, what: string): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetcher(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/css,*/*;q=0.1" }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
  } catch (e) {
    throw new FontDownloadError(`${what} request failed: ${(e as Error)?.name === "TimeoutError" ? "timed out" : "network error"}`);
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new FontDownloadError(`${what} request failed with HTTP ${res.status}`);
  }
  return readCapped(res, max, what);
}

type Face = { url: string; weight: string; style: "normal" | "italic"; unicodeRange?: string };

/** Parse Google Fonts CSS2 output into latin/latin-ext WOFF2 faces. Every value is validated; nothing is passed through as CSS. */
export function parseFontCss(css: string): Face[] {
  const faces: Face[] = [];
  const labelled = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face/i.test(css);
  for (const m of css.matchAll(/(?:\/\*\s*([a-z0-9-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/gi)) {
    const subset = m[1]?.toLowerCase();
    if (labelled && (!subset || !SUBSETS.has(subset))) continue;
    const body = m[2];
    const src = /src:\s*url\(\s*['"]?([^'")\s]+)['"]?\s*\)\s*format\(\s*['"]woff2['"]\s*\)/i.exec(body)?.[1];
    if (!src) continue;
    if (!src.startsWith(FILE_PREFIX)) throw new FontDownloadError("Font CSS referenced an unexpected host");
    const weight = /font-weight:\s*(\d{3}(?: \d{3})?)\s*;/i.exec(body)?.[1] ?? "400";
    const style = /font-style:\s*italic/i.test(body) ? "italic" : "normal";
    const range = /unicode-range:\s*([^;]+);/i.exec(body)?.[1]?.trim();
    faces.push({ url: src, weight, style, ...(range && /^[U+0-9A-Fa-f?, -]+$/.test(range) ? { unicodeRange: range } : {}) });
  }
  return faces.slice(0, MAX_FACES);
}

/** Weights to request: 400 and 700 where the curated list has them, else its first weight; plain family if not curated. */
function cssUrl(family: string): string {
  const curated = loadFonts().find((f) => f.family.toLowerCase() === family.toLowerCase());
  const weights = curated ? curated.weights.filter((w) => WANTED_WEIGHTS.includes(w)) : [];
  const pick = curated && !weights.length ? [curated.weights[0]] : weights;
  const fam = encodeURIComponent(family).replace(/%20/g, "+");
  return `${CSS_HOST}?family=${fam}${pick.length ? `:wght@${pick.join(";")}` : ""}&display=swap`;
}

/**
 * Download a Google Font as WOFF2 files (latin and latin-ext subsets) for offline bundling.
 * Only fonts.googleapis.com (CSS) and fonts.gstatic.com (files) are contacted; timeouts and size caps apply.
 * Throws FontDownloadError on any failure; callers fall back to a system font stack.
 */
export async function downloadFont(family: string, opts: { fetcher?: FontFetcher } = {}): Promise<FontFile[]> {
  const fetcher = opts.fetcher ?? ((url, init) => fetch(url, init));
  const name = family.trim();
  if (!FAMILY_RE.test(name)) throw new FontDownloadError("Invalid font family name");
  const css = (await get(fetcher, cssUrl(name), MAX_CSS_BYTES, "Font CSS")).toString("utf8");
  const faces = parseFontCss(css);
  if (!faces.length) throw new FontDownloadError("No WOFF2 files found for this font");

  const slug = fontSlug(name);
  const byUrl = new Map<string, { file: string; bytes: Buffer }>();
  const out: FontFile[] = [];
  let total = 0;
  for (const face of faces) {
    let entry = byUrl.get(face.url);
    if (!entry) {
      const bytes = await get(fetcher, face.url, MAX_FILE_BYTES, "Font file");
      if (bytes.subarray(0, 4).toString("latin1") !== "wOF2") throw new FontDownloadError("Font file is not WOFF2");
      total += bytes.length;
      if (total > MAX_FAMILY_BYTES) throw new FontDownloadError("Font family too large");
      entry = { file: `${slug}-${face.weight.replace(" ", "-")}${face.style === "italic" ? "-italic" : ""}-${byUrl.size + 1}.woff2`, bytes };
      byUrl.set(face.url, entry);
    }
    out.push({ file: entry.file, bytes: entry.bytes, weight: face.weight, style: face.style, ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}) });
  }
  return out;
}
