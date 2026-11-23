import { it, expect } from "vitest";
import { request } from "./helpers/request.js";
import { createApp } from "../src/app.js";

it("GET /api/health returns ok", async () => {
  const res = await request(createApp({ dataDir: "./.tmp-test" })).get("/api/health");
  expect(res.body).toEqual({ ok: true });
});
