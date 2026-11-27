import { describe, expect, it } from "vitest";
import { clickLine, isLineSelected, selectionRange } from "./diff-line-selection";

describe("clickLine", () => {
  it("何も選んでいないときにクリックすると、その1行を選ぶ", () => {
    expect(clickLine(null, "a.ts", 3, false)).toEqual({ path: "a.ts", anchorIdx: 3, focusIdx: 3 });
  });

  it("Shift+クリックすると、最初にクリックした行からの範囲になる", () => {
    const first = clickLine(null, "a.ts", 3, false);
    expect(clickLine(first, "a.ts", 7, true)).toEqual({ path: "a.ts", anchorIdx: 3, focusIdx: 7 });
  });

  it("Shift+クリックを続けても、起点は最初にクリックした行のまま", () => {
    const first = clickLine(null, "a.ts", 3, false);
    const second = clickLine(first, "a.ts", 7, true);
    expect(clickLine(second, "a.ts", 1, true)).toEqual({ path: "a.ts", anchorIdx: 3, focusIdx: 1 });
  });

  it("Shift なしで別の行をクリックすると、その1行を選び直す", () => {
    const range = clickLine(clickLine(null, "a.ts", 3, false), "a.ts", 7, true);
    expect(clickLine(range, "a.ts", 5, false)).toEqual({ path: "a.ts", anchorIdx: 5, focusIdx: 5 });
  });

  it("選んでいる1行をもう一度クリックすると、選択を外す", () => {
    expect(clickLine(clickLine(null, "a.ts", 3, false), "a.ts", 3, false)).toBeNull();
  });

  it("別のファイルの行を Shift+クリックしたら、範囲にせずその1行を選び直す", () => {
    const first = clickLine(null, "a.ts", 3, false);
    expect(clickLine(first, "b.ts", 7, true)).toEqual({ path: "b.ts", anchorIdx: 7, focusIdx: 7 });
  });
});

describe("selectionRange", () => {
  it("下から上へ選んでも、小さい行番号から大きい行番号の順で返す", () => {
    expect(selectionRange({ path: "a.ts", anchorIdx: 7, focusIdx: 3 })).toEqual([3, 7]);
  });
});

describe("isLineSelected", () => {
  const sel = { path: "a.ts", anchorIdx: 3, focusIdx: 5 };

  it("範囲の両端と内側の行は選ばれている", () => {
    expect([3, 4, 5].map((i) => isLineSelected(sel, "a.ts", i))).toEqual([true, true, true]);
  });

  it("範囲の外の行と、別のファイルの行は選ばれていない", () => {
    expect(isLineSelected(sel, "a.ts", 2)).toBe(false);
    expect(isLineSelected(sel, "a.ts", 6)).toBe(false);
    expect(isLineSelected(sel, "b.ts", 4)).toBe(false);
  });

  it("何も選んでいなければ、どの行も選ばれていない", () => {
    expect(isLineSelected(null, "a.ts", 3)).toBe(false);
  });
});
