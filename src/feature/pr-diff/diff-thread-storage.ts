import type { DiffThread, ThreadAnchor, ThreadMessage } from "./diff-threads";

export type ThreadMap = Record<string, DiffThread>;

function storageKey(repo: string, prNumber: number) {
  return `gh-chillbox:diff-threads:${repo}:${prNumber}`;
}

export function loadThreads(repo: string, prNumber: number): ThreadMap {
  try {
    const raw = localStorage.getItem(storageKey(repo, prNumber));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveThreads(repo: string, prNumber: number, threads: ThreadMap) {
  try {
    localStorage.setItem(storageKey(repo, prNumber), JSON.stringify(threads));
  } catch {}
}

// Diff タブを離れている間に回答が返っても失わないよう、state ではなく localStorage を正とする
export function appendThreadMessage(repo: string, prNumber: number, anchor: ThreadAnchor, msg: ThreadMessage): ThreadMap {
  const threads = loadThreads(repo, prNumber);
  const current = threads[anchor.key] ?? { ...anchor, messages: [] };
  const next = { ...threads, [anchor.key]: { ...current, messages: [...current.messages, msg] } };
  saveThreads(repo, prNumber, next);
  return next;
}

export function removeThread(repo: string, prNumber: number, key: string): ThreadMap {
  const { [key]: _removed, ...rest } = loadThreads(repo, prNumber);
  saveThreads(repo, prNumber, rest);
  return rest;
}
