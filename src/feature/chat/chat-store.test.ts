import { describe, it, expect, beforeEach, vi } from "vitest";
import { initAppStorage } from "../../app-storage";
import { getSession } from "../session-store/session-store";
import { appendMessage, chatLoadingKey, chatStorageKey, loadMessages } from "./chat-store";

const emptyLegacy = { length: 0, key: () => null, getItem: () => null };

describe("chat-store", () => {
  beforeEach(async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({})));
    await initAppStorage({ fetch, legacy: emptyLegacy });
  });

  it("repo と PR 番号から履歴のキーと送信中のキーを作る", () => {
    const key = chatStorageKey("owner/repo", 1);
    expect(key).toBe("gh-chillbox:chat:owner/repo:1");
    expect(chatLoadingKey(key)).toBe("gh-chillbox:chat:owner/repo:1:loading");
  });

  it("追加したメッセージは置き場所と保存先の両方から読める", () => {
    const key = chatStorageKey("owner/repo", 2);
    appendMessage(key, { role: "user", content: "要約して" });
    appendMessage(key, { role: "assistant", content: "要約です" });
    const expected = [
      { role: "user", content: "要約して" },
      { role: "assistant", content: "要約です" },
    ];
    expect(getSession(key, [])).toEqual(expected);
    expect(loadMessages(key)).toEqual(expected);
  });

  it("保存されていないキーは空の履歴を返す", () => {
    expect(loadMessages(chatStorageKey("owner/repo", 3))).toEqual([]);
  });
});
