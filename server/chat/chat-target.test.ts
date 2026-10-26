import { describe, it, expect } from "vitest";
import { isValidChatTarget } from "./chat-target";

describe("isValidChatTarget", () => {
  it("owner/name 形式のリポジトリと正の整数の PR 番号を受け付ける", () => {
    expect(isValidChatTarget("yyYank/gh-chillbox", 12)).toBe(true);
    expect(isValidChatTarget("my.org/repo_name-2", 1)).toBe(true);
  });

  it("- 始まりや区切りの多いリポジトリ名は gh の引数として危険なので弾く", () => {
    expect(isValidChatTarget("--web", 1)).toBe(false);
    expect(isValidChatTarget("-o/r", 1)).toBe(false);
    expect(isValidChatTarget("o/r/x", 1)).toBe(false);
    expect(isValidChatTarget("o/../r", 1)).toBe(false);
    expect(isValidChatTarget("o r/x", 1)).toBe(false);
  });

  it("正の整数以外の PR 番号は弾く", () => {
    expect(isValidChatTarget("o/r", 0)).toBe(false);
    expect(isValidChatTarget("o/r", -1)).toBe(false);
    expect(isValidChatTarget("o/r", 1.5)).toBe(false);
    expect(isValidChatTarget("o/r", "--web")).toBe(false);
  });
});
