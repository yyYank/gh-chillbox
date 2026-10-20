import { describe, it, expect, beforeEach, vi } from "vitest";
import { initAppStorage } from "../../app-storage";
import { clearSessionStore, getSession } from "../session-store/session-store";
import { appendMessage, broadcastChat, chatLoadingKey, chatStorageKey, loadMessages } from "./chat-store";

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

describe("broadcastChat", () => {
  beforeEach(async () => {
    clearSessionStore();
    const fetch = vi.fn(async () => new Response(JSON.stringify({})));
    await initAppStorage({ fetch, legacy: emptyLegacy });
  });

  it("履歴が空のタブにだけ並列で送り、回答を各タブの履歴に追加する", async () => {
    appendMessage(chatStorageKey("o/r", 2), { role: "user", content: "前の質問" });
    const post = vi.fn(async (payload: Record<string, unknown>) => `#${payload.prNumber} の要約`);

    const result = await broadcastChat("o/r", [1, 2, 3], "このPRを要約して", post);

    expect(result).toEqual({ sent: [1, 3], skipped: [2] });
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledWith({ repo: "o/r", prNumber: 1, question: "このPRを要約して" });
    expect(loadMessages(chatStorageKey("o/r", 1))).toEqual([
      { role: "user", content: "このPRを要約して" },
      { role: "assistant", content: "#1 の要約" },
    ]);
    expect(loadMessages(chatStorageKey("o/r", 2))).toEqual([{ role: "user", content: "前の質問" }]);
  });

  it("送信中はタブを送信中にし、終わったら解除する", async () => {
    const key = chatStorageKey("o/r", 1);
    let loadingWhileSending = false;
    const post = async () => {
      loadingWhileSending = getSession(chatLoadingKey(key), false);
      return "回答";
    };
    await broadcastChat("o/r", [1], "質問", post);
    expect(loadingWhileSending).toBe(true);
    expect(getSession(chatLoadingKey(key), false)).toBe(false);
  });

  it("送信に失敗したタブにはエラーを履歴に残し、ほかのタブは続ける", async () => {
    const post = async (payload: Record<string, unknown>) => {
      if (payload.prNumber === 1) {
        throw new Error("API error: 500");
      }
      return "回答";
    };
    await broadcastChat("o/r", [1, 2], "質問", post);
    expect(loadMessages(chatStorageKey("o/r", 1)).at(-1)).toEqual({
      role: "assistant",
      content: "エラー: API error: 500",
    });
    expect(loadMessages(chatStorageKey("o/r", 2)).at(-1)).toEqual({ role: "assistant", content: "回答" });
  });
});
