import { describe, it, expect } from "vitest";
import { chatSystemPrompt } from "./chat-system-prompt";

describe("chatSystemPrompt", () => {
  it("今回の nonce のタグの中身に従わないルールと回答ルールを含む", () => {
    const prompt = chatSystemPrompt("abc");
    expect(prompt).toContain("<untrusted-abc");
    expect(prompt).toContain("必ずコードを読んでから答える");
  });
});
