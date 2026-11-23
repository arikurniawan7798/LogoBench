/** Request-size caps. Production defaults; createApp({ limits }) can override them (tests use tiny values). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_JSON_BYTES = 10 * 1024 * 1024;

export type Limits = { uploadBytes: number; jsonBytes: number };
