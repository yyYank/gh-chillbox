import { describe, it, expect, vi } from "vitest";
import { appStorage, initAppStorage, type LegacyStorage } from "./app-storage";

function legacy(entries: Record<string, string>): LegacyStorage {
  return {
    get length() {
      return Object.keys(entries).length;
    },
    key: (i) => Object.keys(entries)[i] ?? null,
    getItem: (k) => entries[k] ?? null,
  };
}

function fakeFetch(stored: Record<string, string> | Error) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init && stored instanceof Error) {
      throw stored;
    }
    return new Response(JSON.stringify(init ? { ok: true } : stored));
  });
}

describe("appStorage", () => {
  it("server に保存された値を同期的に読める", async () => {
    await initAppStorage({ fetch: fakeFetch({ a: "1" }), legacy: legacy({}) });
    expect(appStorage.getItem("a")).toBe("1");
    expect(appStorage.getItem("missing")).toBeNull();
  });

  it("書き込みと削除を server に送る", async () => {
    const fetch = fakeFetch({ x: "0" });
    await initAppStorage({ fetch, legacy: legacy({}) });

    appStorage.setItem("gh-chillbox:o/r:k", "v");
    expect(appStorage.getItem("gh-chillbox:o/r:k")).toBe("v");
    expect(fetch).toHaveBeenCalledWith("/api/store/gh-chillbox%3Ao%2Fr%3Ak", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "v" }),
    });

    appStorage.removeItem("gh-chillbox:o/r:k");
    expect(appStorage.getItem("gh-chillbox:o/r:k")).toBeNull();
    expect(fetch).toHaveBeenCalledWith("/api/store/gh-chillbox%3Ao%2Fr%3Ak", { method: "DELETE" });
  });

  it("server が空なら localStorage の値を移す", async () => {
    const fetch = fakeFetch({});
    await initAppStorage({ fetch, legacy: legacy({ a: "1" }) });
    expect(appStorage.getItem("a")).toBe("1");
    expect(fetch).toHaveBeenCalledWith("/api/store/a", expect.objectContaining({ method: "PUT" }));
  });

  it("server に無いキーだけ localStorage から移し、server にあるキーは server の値を優先する", async () => {
    const fetch = fakeFetch({ theme: "dark" });
    await initAppStorage({ fetch, legacy: legacy({ theme: "light", memo: "m" }) });
    expect(appStorage.getItem("theme")).toBe("dark");
    expect(appStorage.getItem("memo")).toBe("m");
    expect(fetch).toHaveBeenCalledWith("/api/store/memo", expect.objectContaining({ method: "PUT" }));
    expect(fetch).not.toHaveBeenCalledWith("/api/store/theme", expect.anything());
  });

  it("server に接続できないときは localStorage の値で表示する", async () => {
    await initAppStorage({ fetch: fakeFetch(new Error("offline")), legacy: legacy({ a: "1" }) });
    expect(appStorage.getItem("a")).toBe("1");
  });
});
