import { appStorage } from "../../app-storage";
import { getSession, setSession } from "../session-store/session-store";

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
