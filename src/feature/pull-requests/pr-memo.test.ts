import { describe, it, expect } from "vitest";
import { setMemo, parseMemos } from "./pr-memo";

describe("setMemo", () => {
  it("PR 番号に対してメモを設定する", () => {
    expect(setMemo({}, 12, "あとで見る")).toEqual({ 12: "あとで見る" });
  });

  it("空文字にしたらその PR のメモを削除する", () => {
    expect(setMemo({ 12: "あとで見る", 13: "済" }, 12, "")).toEqual({ 13: "済" });
  });

  it("元のメモを書き換えない", () => {
    const memos = { 12: "あとで見る" };
    setMemo(memos, 12, "済");
    expect(memos).toEqual({ 12: "あとで見る" });
  });
});

describe("parseMemos", () => {
  it("保存値を読み取る", () => {
    expect(parseMemos('{"12":"あとで見る"}')).toEqual({ 12: "あとで見る" });
  });

  it("保存値がない・壊れているときは空にする", () => {
    expect(parseMemos(null)).toEqual({});
    expect(parseMemos("{broken")).toEqual({});
    expect(parseMemos("[1,2]")).toEqual({});
  });
});
