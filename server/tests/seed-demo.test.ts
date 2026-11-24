import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { request } from "./helpers/request.js";
import { createApp } from "../src/app.js";
import { seedDemo, SeedRefusedError } from "../scripts/demo/seed.js";
import { BRANDS, HALDEN } from "../scripts/demo/content.js";

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "logobench-seed-"));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await fs.rm(dir, { recursive: true, force: true });
});

const noNetwork = () => {
  const fetchSpy = vi.fn(async () => {
    throw new Error("network access during seeding");
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
};

describe("demo seed", () => {
  it("creates every demo project with review, palette and type, without network", async () => {
    const fetchSpy = noNetwork();
    const target = path.join(dir, "data-demo"); // does not exist yet
    const r = await seedDemo({ dataDir: target });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r.projects.map((p) => p.name)).toEqual(BRANDS.map((b) => b.name));
    expect(r.projects.find((p) => p.name === HALDEN.name)?.versions).toBe(2);

    vi.unstubAllGlobals();
    const app = createApp({ hostCheck: false, dataDir: target });
    const list = await request(app).get("/api/projects");
    expect(list.status).toBe(200);
    expect(list.body.map((p: { name: string }) => p.name)).toEqual(BRANDS.map((b) => b.name));

    for (const p of r.projects) {
      const review = await request(app).get(`/api/projects/${p.id}/review`);
      expect(review.status).toBe(200);
      expect(Object.keys(review.body.result.scores)).toHaveLength(5);
      const colors = await request(app).get(`/api/projects/${p.id}/colors`);
      expect(colors.status).toBe(200);
      expect(colors.body.main.name).toBeTruthy();
      const type = await request(app).get(`/api/projects/${p.id}/type`);
      expect(type.status).toBe(200);
      expect(type.body.heading).toBe(BRANDS.find((b) => b.name === p.name)!.type.heading);
    }

    const halden = r.projects.find((p) => p.name === HALDEN.name)!;
    const brief = await request(app).get(`/api/projects/${halden.id}/brief`);
    expect(brief.body.text).toContain("Halden Roasters is a small-batch coffee roaster");
    expect(brief.body.text).toContain("Form: Logo brief questionnaire");
    const pdf = await request(app).get(`/api/projects/${halden.id}/report.pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    const compares = await request(app).get("/api/compares");
    expect(compares.body).toHaveLength(1);
    expect((await request(app).get("/api/forms")).body).toHaveLength(1);
  }, 60_000);

  it("refuses a non-empty directory without force, and replaces it with force", async () => {
    noNetwork();
    await seedDemo({ dataDir: dir });
    await expect(seedDemo({ dataDir: dir })).rejects.toBeInstanceOf(SeedRefusedError);

    const again = await seedDemo({ dataDir: dir, force: true });
    expect(again.projects).toHaveLength(BRANDS.length);
    const ids = await fs.readdir(path.join(dir, "projects"));
    expect(ids.sort()).toEqual(again.projects.map((p) => p.id).sort()); // old projects were removed, not duplicated
  }, 60_000);

  it("never clears a directory that holds anything other than LogoBench data, or a protected one", async () => {
    await fs.writeFile(path.join(dir, "notes.txt"), "keep me");
    await expect(seedDemo({ dataDir: dir, force: true })).rejects.toThrow(/not LogoBench data/);
    expect(await fs.readFile(path.join(dir, "notes.txt"), "utf8")).toBe("keep me");

    const empty = path.join(dir, "empty");
    await expect(seedDemo({ dataDir: empty, protectedDirs: [empty] })).rejects.toThrow(/real data directory/);
  });
});
