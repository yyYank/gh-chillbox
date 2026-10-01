import { describe, it, expect } from "vitest";
import { extractGherkinCases } from "./test-cases-gherkin";

function cases(content: string) {
  const [file] = extractGherkinCases([{ path: "a.feature", content }]);
  return file.cases;
}

describe("extractGherkinCases", () => {
  it("Feature・Rule・Scenario を入れ子の名前つきで取り出す", () => {
    const src = `Feature: ログイン
  Background:
    Given トップページを開く

  Scenario: 正しいパスワード
    When ログインする

  Rule: ロック
    Example: 5回失敗
      Then ロックされる
`;
    expect(cases(src).map((c) => [c.kind, c.names.join(" > ")])).toEqual([
      ["feature", "ログイン"],
      ["scenario", "ログイン > 正しいパスワード"],
      ["rule", "ログイン > ロック"],
      ["scenario", "ログイン > ロック > 5回失敗"],
    ]);
  });

  it("Scenario Outline は Examples を展開せず1件にし、outline の印を付ける", () => {
    const src = `Feature: 計算
  Scenario Outline: 足し算
    When <a> と <b> を足す
    Examples:
      | a | b |
      | 1 | 2 |
      | 3 | 4 |
`;
    expect(cases(src).map((c) => [c.names.join(" > "), c.modifiers])).toEqual([
      ["計算", []],
      ["計算 > 足し算", ["outline"]],
    ]);
  });

  it("日本語キーワードを読める", () => {
    const src = `# language: ja
機能: 会員登録
  シナリオ: メールで登録
    前提 登録画面を開く
  シナリオアウトライン: 入力チェック
    例:
      | 値 |
`;
    expect(cases(src).map((c) => [c.kind, c.names.join(" > "), c.modifiers])).toEqual([
      ["feature", "会員登録", []],
      ["scenario", "会員登録 > メールで登録", []],
      ["scenario", "会員登録 > 入力チェック", ["outline"]],
    ]);
  });

  it("直前のタグを @ を除いて modifiers に入れる", () => {
    const src = `@wip
Feature: F
  @skip @slow
  Scenario: S
`;
    expect(cases(src).map((c) => c.modifiers)).toEqual([["wip"], ["skip", "slow"]]);
  });

  it("DocString の中の Scenario: は無視し、行番号を持つ", () => {
    const src = `Feature: F
  Scenario: 本物
    Given 本文
      """
      Scenario: 偽物
      """
`;
    expect(cases(src).map((c) => [c.names.join(" > "), c.line])).toEqual([
      ["F", 1],
      ["F > 本物", 2],
    ]);
  });
});
