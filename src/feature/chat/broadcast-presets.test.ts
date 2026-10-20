import { describe, it, expect } from "vitest";
import { addPreset, parsePresets, removePreset, updatePreset, type Preset } from "./broadcast-presets";

const summary: Preset = { id: "a", name: "要約", prompt: "このPRを要約して" };
const risk: Preset = { id: "b", name: "リスク", prompt: "このPRのリスクを挙げて" };

describe("parsePresets", () => {
  it("保存されていなければ空の一覧にする", () => {
    expect(parsePresets(null)).toEqual([]);
  });

  it("保存されたプリセットを読み込む", () => {
    expect(parsePresets(JSON.stringify([summary, risk]))).toEqual([summary, risk]);
  });

  it("壊れた値や形の違う要素は取り除く", () => {
    expect(parsePresets("not json")).toEqual([]);
    expect(parsePresets(JSON.stringify([summary, { id: "x" }, "text", null]))).toEqual([summary]);
  });
});

describe("addPreset", () => {
  it("末尾に追加する", () => {
    expect(addPreset([summary], { name: "リスク", prompt: "このPRのリスクを挙げて" }, "b")).toEqual([summary, risk]);
  });
});

describe("updatePreset", () => {
  it("指定したプリセットの名前と本文だけを書き換える", () => {
    expect(updatePreset([summary, risk], "a", { name: "要約(短く)", prompt: "3行で要約して" })).toEqual([
      { id: "a", name: "要約(短く)", prompt: "3行で要約して" },
      risk,
    ]);
  });
});

describe("removePreset", () => {
  it("指定したプリセットだけを削除する", () => {
    expect(removePreset([summary, risk], "a")).toEqual([risk]);
  });
});
