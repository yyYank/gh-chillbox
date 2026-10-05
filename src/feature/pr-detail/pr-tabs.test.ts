import { describe, it, expect } from "vitest";
import { addTab, closeTab, parseTabs, tabTooltip } from "./pr-tabs";

describe("tabTooltip", () => {
  it("タイトルとメモを改行して並べる", () => {
    expect(tabTooltip("Fix login", "後で再レビュー")).toBe("Fix login\nメモ: 後で再レビュー");
  });

  it("メモがなければタイトルだけ", () => {
    expect(tabTooltip("Fix login", undefined)).toBe("Fix login");
  });

  it("タイトル読み込み前ならメモだけ", () => {
    expect(tabTooltip(undefined, "後で再レビュー")).toBe("メモ: 後で再レビュー");
  });
});

describe("addTab", () => {
  it("開いた PR を末尾に追加する", () => {
    expect(addTab([2007], 2008)).toEqual([2007, 2008]);
  });

  it("既に開いている PR は重複させない", () => {
    expect(addTab([2007, 2008], 2007)).toEqual([2007, 2008]);
  });
});

describe("closeTab", () => {
  it("表示中のタブを閉じると右隣のタブに移る", () => {
    expect(closeTab([1, 2, 3], 2, 2)).toEqual({ tabs: [1, 3], active: 3 });
  });

  it("右隣がなければ左隣のタブに移る", () => {
    expect(closeTab([1, 2, 3], 3, 3)).toEqual({ tabs: [1, 2], active: 2 });
  });

  it("表示中でないタブを閉じても表示中のタブは変わらない", () => {
    expect(closeTab([1, 2, 3], 1, 3)).toEqual({ tabs: [2, 3], active: 3 });
  });

  it("最後のタブを閉じると表示中のタブはなくなる", () => {
    expect(closeTab([1], 1, 1)).toEqual({ tabs: [], active: null });
  });
});

describe("parseTabs", () => {
  it("保存された PR 番号の配列を読み込む", () => {
    expect(parseTabs("[2007,2008]")).toEqual([2007, 2008]);
  });

  it("壊れた値や番号以外の要素は無視する", () => {
    expect(parseTabs("not json")).toEqual([]);
    expect(parseTabs(null)).toEqual([]);
    expect(parseTabs('[1,"x",2.5,3]')).toEqual([1, 3]);
  });
});
