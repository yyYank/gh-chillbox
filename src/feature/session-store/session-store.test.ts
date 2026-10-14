import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getSession,
  setSession,
  subscribeSession,
  loadSessionOnce,
  clearSessionStore,
  initSession,
} from "./session-store";

beforeEach(() => {
  clearSessionStore();
});

describe("getSession / setSession", () => {
  it("値がないときは初期値を返す", () => {
    expect(getSession("k", 1)).toBe(1);
  });

  it("設定した値を返す", () => {
    setSession("k", 2);
    expect(getSession("k", 1)).toBe(2);
  });

  it("関数を渡すと直前の値から更新する", () => {
    setSession("k", 2);
    setSession<number>("k", (prev) => (prev ?? 0) + 1);
    expect(getSession("k", 0)).toBe(3);
  });
});

describe("subscribeSession", () => {
  it("同じキーの値が変わったら知らせる", () => {
    const listener = vi.fn();
    subscribeSession("k", listener);
    setSession("k", 1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("別のキーの変更は知らせない", () => {
    const listener = vi.fn();
    subscribeSession("k", listener);
    setSession("other", 1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("購読をやめたら知らせない", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSession("k", listener);
    unsubscribe();
    setSession("k", 1);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("loadSessionOnce", () => {
  it("取得中は loading になり、終わったら data を持つ", async () => {
    let resolve: (v: string) => void = () => {};
    loadSessionOnce("k", () => new Promise<string>((r) => (resolve = r)));
    expect(getSession("k", null)).toEqual({ loading: true, error: null, data: null });

    resolve("ok");
    await vi.waitFor(() => expect(getSession("k", null)).toEqual({ loading: false, error: null, data: "ok" }));
  });

  it("同じキーなら2回目以降は取得しない（画面を作り直しても再取得しない）", () => {
    const loader = vi.fn(() => Promise.resolve("ok"));
    loadSessionOnce("k", loader);
    loadSessionOnce("k", loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("失敗したら error を持つ", async () => {
    loadSessionOnce("k", () => Promise.reject(new Error("boom")));
    await vi.waitFor(() => expect(getSession("k", null)).toEqual({ loading: false, error: "boom", data: null }));
  });
});

describe("initSession", () => {
  it("値がないときだけ初期値を入れる", () => {
    initSession("k", () => [1]);
    expect(getSession("k", [])).toEqual([1]);
  });

  it("すでに値があれば上書きしない", () => {
    setSession("k", [2]);
    const init = vi.fn(() => [1]);
    initSession("k", init);
    expect(getSession("k", [])).toEqual([2]);
    expect(init).not.toHaveBeenCalled();
  });
});
