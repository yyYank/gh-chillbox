import { appStorage } from "../../app-storage";
import { getSession, initSession, setSession } from "../session-store/session-store";

export type Message = {
  role: "user" | "assistant";
  content: string;
};

export function chatStorageKey(repo: string, prNumber: number): string {
  return `gh-chillbox:chat:${repo}:${prNumber}`;
}

export function chatLoadingKey(storageKey: string): string {
  return `${storageKey}:loading`;
}

// 画面が破棄されていても届いた返事を残せるよう、置き場所と appStorage の両方に書く
export function appendMessage(key: string, msg: Message) {
  setSession<Message[]>(key, (prev) => [...(prev ?? []), msg]);
  try {
    appStorage.setItem(key, JSON.stringify(getSession<Message[]>(key, [])));
  } catch {}
}

export function loadMessages(key: string): Message[] {
  try {
    const raw = appStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function postChat(payload: Record<string, unknown>): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  const data = await res.json();
  return data.answer;
}

type Post = (payload: Record<string, unknown>) => Promise<string>;
type FetchApproved = (repo: string, prNumbers: number[]) => Promise<number[]>;

export async function fetchApprovedPrs(repo: string, prNumbers: number[]): Promise<number[]> {
  const params = new URLSearchParams({ repo, numbers: prNumbers.join(",") });
  const res = await fetch(`/api/pr-approvals?${params}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  const data = await res.json();
  return data.approved;
}

// 開いている全タブに同じ質問を並列で送る。送信中のタブと、指定があれば会話があるタブや approve 済みのタブは飛ばす
export async function broadcastChat(
  repo: string,
  prNumbers: number[],
  question: string,
  { skipWithHistory, skipApproved }: { skipWithHistory: boolean; skipApproved: boolean },
  post: Post = postChat,
  fetchApproved: FetchApproved = fetchApprovedPrs,
): Promise<{ sent: number[]; skipped: number[] }> {
  const approved = new Set(skipApproved ? await fetchApproved(repo, prNumbers) : []);
  const sent: number[] = [];
  const skipped: number[] = [];
  for (const prNumber of prNumbers) {
    const key = chatStorageKey(repo, prNumber);
    initSession(key, () => loadMessages(key));
    const hasHistory = getSession<Message[]>(key, []).length > 0;
    const skip = getSession(chatLoadingKey(key), false) || (skipWithHistory && hasHistory) || approved.has(prNumber);
    (skip ? skipped : sent).push(prNumber);
  }

  await Promise.all(
    sent.map(async (prNumber) => {
      const key = chatStorageKey(repo, prNumber);
      appendMessage(key, { role: "user", content: question });
      setSession(chatLoadingKey(key), true);
      try {
        const answer = await post({ repo, prNumber, question });
        appendMessage(key, { role: "assistant", content: answer });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "エラーが発生しました";
        appendMessage(key, { role: "assistant", content: `エラー: ${msg}` });
      } finally {
        setSession(chatLoadingKey(key), false);
      }
    }),
  );
  return { sent, skipped };
}
