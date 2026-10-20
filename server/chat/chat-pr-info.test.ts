import { describe, it, expect } from "vitest";
import { fillPrInfo } from "./chat-pr-info";

describe("fillPrInfo", () => {
  const view = { title: "gh のタイトル", body: "gh の本文" };

  it("タイトルと本文が送られてこなければ gh pr view の値で補う", () => {
    expect(fillPrInfo({}, view)).toEqual({ prTitle: "gh のタイトル", prBody: "gh の本文" });
  });

  it("画面から送られてきた値はそのまま使う", () => {
    expect(fillPrInfo({ prTitle: "画面のタイトル", prBody: "画面の本文" }, view)).toEqual({
      prTitle: "画面のタイトル",
      prBody: "画面の本文",
    });
  });

  it("本文が空文字で送られてきたときは本文なしとして扱い、補わない", () => {
    expect(fillPrInfo({ prTitle: "画面のタイトル", prBody: "" }, view).prBody).toBe("");
  });
});
