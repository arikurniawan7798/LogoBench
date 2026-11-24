import type { ApiError } from "./api";

/** Client-side upload checks shared by Home and Tools; the server enforces the same rules. */
export const ACCEPT = ".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp";
const MIME_OK = new Set(["image/svg+xml", "image/png", "image/jpeg", "image/webp"]);
const EXT_OK = /\.(svg|png|jpe?g|webp)$/i;
/** Mirrors the server's MAX_UPLOAD_BYTES (server/src/limits.ts); the server still enforces it. */
const MAX_BYTES = 10 * 1024 * 1024;

export function checkFile(file: File): ApiError | null {
  if (!MIME_OK.has(file.type) && !EXT_OK.test(file.name)) {
    return { code: "UNSUPPORTED_MEDIA", message: `"${file.name}" is not an SVG, PNG, JPG or WebP image.` };
  }
  if (file.size > MAX_BYTES) return { code: "TOO_LARGE", message: "Logo files are limited to 10 MB." };
  return null;
}
