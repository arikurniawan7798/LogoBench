import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { request } from "./helpers/request.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { MAX_UPLOAD_BYTES, MAX_JSON_BYTES } from "../src/limits.js";

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);
const SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><script>x</script><rect width="4" height="4" fill="#00f"/></svg>`,
);

let dir: string;
let app: ReturnType<typeof createApp>;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "logobench-p-"));
  app = createApp({ dataDir: dir });
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("projects api", () => {
  it("GET /api/projects empty returns []", async () => {
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("rejects .gif/.pdf with 415", async () => {
    const gif = await request(app).post("/api/projects").attach("logo", Buffer.from("GIF89a....."), "a.gif");
    expect(gif.status).toBe(415);
    const pdf = await request(app).post("/api/projects").attach("logo", Buffer.from("%PDF-1.4 x"), "a.pdf");
    expect(pdf.status).toBe(415);
  });

  it("rejects file with png extension but non-image bytes with 415", async () => {
    const res = await request(app).post("/api/projects").attach("logo", Buffer.from("hello world, not an image"), "fake.png");
    expect(res.status).toBe(415);
  });

  it("rejects an upload over the configured cap with 413 (tiny injected limit, small body)", async () => {
    const small = createApp({ dataDir: dir, limits: { uploadBytes: 2048 } });
    const big = Buffer.concat([PNG, Buffer.alloc(2048)]);
    const res = await request(small).post("/api/projects").attach("logo", big, "big.png");
    expect(res.status).toBe(413);
  });

  it("production defaults are 10 MB upload / 10 MB JSON and createApp() uses them", () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_JSON_BYTES).toBe(10 * 1024 * 1024);
    expect(app.locals.ctx.limits).toEqual({ uploadBytes: MAX_UPLOAD_BYTES, jsonBytes: MAX_JSON_BYTES });
  });

  it("rejects missing file with 400", async () => {
    const res = await request(app).post("/api/projects").field("name", "x");
    expect(res.status).toBe(400);
  });

  it("hostile original name is stored under generated id and shown only as originalName", async () => {
    const res = await request(app).post("/api/projects").attach("logo", PNG, { filename: "..\..\evil.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    const v = res.body.versions[0];
    expect(v.originalName).toContain("evil.png");
    expect(v.file).not.toMatch(/evil|\.\.|[\/]/);
    const list = await request(app).get("/api/projects");
    expect(list.body).toHaveLength(1);
    const all = JSON.stringify(await fs.readdir(dir, { recursive: true }));
    expect(all).not.toMatch(/evil/);
  });

  it("creates, gets, adds version, serves latest logo", async () => {
    const c = await request(app).post("/api/projects").field("name", "Acme").attach("logo", PNG, "a.png");
    expect(c.status).toBe(201);
    expect(c.body.name).toBe("Acme");
    const id = c.body.id;
    const png = await request(app).get(`/api/projects/${id}/logo`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (d) => chunks.push(d));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(png.headers["content-type"]).toMatch(/image\/png/);
    expect(png.body.equals(PNG)).toBe(true);

    const v = await request(app).post(`/api/projects/${id}/versions`).attach("logo", SVG, "b.svg");
    expect(v.status).toBe(201);
    expect(v.body.versions).toHaveLength(2);
    const got = await request(app).get(`/api/projects/${id}`);
    expect(got.body.versions).toHaveLength(2);
    const logo = await request(app).get(`/api/projects/${id}/logo`).buffer(true).parse((r, cb) => { const c: Buffer[] = []; r.on("data", (d) => c.push(d)); r.on("end", () => cb(null, Buffer.concat(c))); });
    const svgText = (logo.body as Buffer).toString("utf8");
    expect(logo.headers["content-type"]).toMatch(/image\/svg\+xml/);
    expect(logo.headers["content-security-policy"]).toBe("default-src 'none'; style-src 'unsafe-inline'");
    expect(svgText).not.toContain("script");
    expect(svgText).toContain('fill="#00f"');
  });

  it("unknown project returns 404", async () => {
    expect((await request(app).get("/api/projects/nope")).status).toBe(404);
    expect((await request(app).get("/api/projects/..%2F..%2Fx")).status).toBe(404);
  });
});
