import { describe, it, expect } from "vitest";
import { chatSessionKey } from "./chat-session";

describe("chatSessionKey", () => {
  it("行範囲の指定がなければ PR 単位のキーになる", () => {
    expect(chatSessionKey({ repo: "o/r", prNumber: 1 })).toBe("o/r:1");
  });

  it("行範囲の指定があれば PR とスレッドキーを合わせたキーになる", () => {
    expect(chatSessionKey({ repo: "o/r", prNumber: 1, threadKey: "src/a.ts:R10-R12" })).toBe("o/r:1:src/a.ts:R10-R12");
  });
});
