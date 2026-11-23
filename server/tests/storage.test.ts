import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../src/storage.js";

let dir: string;
let store: Store;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "logobench-"));
  store = new Store(dir);
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("Store", () => {
  it("writeJson then readJson returns equal object", async () => {
    const obj = { a: 1, b: ["x", { c: true }] };
    await store.writeJson("sub/dir/o.json", obj);
    expect(await store.readJson("sub/dir/o.json")).toEqual(obj);
  });
  it("readJson of missing path returns null", async () => {
    expect(await store.readJson("nope.json")).toBeNull();
  });
  it("any rel path resolving outside dataDir throws", async () => {
    await expect(store.readJson("../x")).rejects.toThrow();
    await expect(store.writeJson("../x", {})).rejects.toThrow();
    await expect(store.writeFile("a/../../x", Buffer.from("x"))).rejects.toThrow();
    await expect(store.list("..")).rejects.toThrow();
  });
  it("writeFile/readFile/list round trip and newId", async () => {
    await store.writeFile("d/f.bin", Buffer.from("hi"));
    expect((await store.readFile("d/f.bin")).toString()).toBe("hi");
    expect(await store.list("d")).toEqual(["f.bin"]);
    expect(await store.list("missing")).toEqual([]);
    expect(store.newId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("writes atomically: no leftover temp files, overwrite works, failed write keeps target intact", async () => {
    await store.writeFile("a/f.txt", Buffer.from("one"));
    await store.writeFile("a/f.txt", Buffer.from("two"));
    expect((await store.list("a")).sort()).toEqual(["f.txt"]);
    expect((await store.readFile("a/f.txt")).toString()).toBe("two");
    // Make the rename fail (target is a directory): original content untouched, temp cleaned.
    await fs.mkdir(path.join(dir, "a/d"), { recursive: true });
    await expect(store.writeFile("a/d", Buffer.from("x"))).rejects.toThrow();
    expect((await store.list("a")).sort()).toEqual(["d", "f.txt"]);
  });
});
