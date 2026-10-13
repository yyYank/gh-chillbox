import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createKvStore } from "./kv-store";

describe("createKvStore", () => {
  let filePath: string;

  beforeEach(() => {
    filePath = path.join(mkdtempSync(path.join(tmpdir(), "kv-store-")), "store.json");
  });

  it("ファイルが無いときは空の状態から始まる", async () => {
    const store = createKvStore(filePath);
    expect(await store.all()).toEqual({});
  });

  it("保存した値を全件取得で読み出せる", async () => {
    const store = createKvStore(filePath);
    await store.set("a", "1");
    await store.set("b", "2");
    expect(await store.all()).toEqual({ a: "1", b: "2" });
  });

  it("削除したキーは全件取得に含まれない", async () => {
    const store = createKvStore(filePath);
    await store.set("a", "1");
    await store.remove("a");
    expect(await store.all()).toEqual({});
  });

  it("作り直してもファイルから値を復元する", async () => {
    await createKvStore(filePath).set("a", "1");
    expect(await createKvStore(filePath).all()).toEqual({ a: "1" });
  });

  it("同時に書き込んでもすべての値が残る", async () => {
    const store = createKvStore(filePath);
    await Promise.all([store.set("a", "1"), store.set("b", "2"), store.set("c", "3")]);
    expect(await createKvStore(filePath).all()).toEqual({ a: "1", b: "2", c: "3" });
  });
});
