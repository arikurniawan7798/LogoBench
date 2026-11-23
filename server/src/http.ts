/** ASCII-only, header-safe filename base derived from a user-supplied name (never empty). */
export function safeBase(name: string): string {
  const base = name.replace(/[^A-Za-z0-9._ -]+/g, "_").replace(/\s+/g, " ").replace(/^[ ._]+|[ ._]+$/g, "").slice(0, 60);
  return base || "logo";
}

/** Content-Disposition attachment: ASCII `filename=` plus an RFC 5987 `filename*` carrying the full UTF-8 name. */
export function contentDisposition(name: string, suffix: string): string {
  const ascii = `${safeBase(name)}${suffix}`;
  const full = `${name.replace(/[\x00-\x1f\x7f]+/g, " ").trim().slice(0, 100) || "logo"}${suffix}`;
  const star = encodeURIComponent(full).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${star}`;
}
