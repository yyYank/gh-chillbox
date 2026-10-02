export type PrMemos = Record<number, string>;

export function memoStorageKey(repo: string): string {
  return `gh-chillbox:memo:${repo}`;
}

export function setMemo(memos: PrMemos, prNumber: number, text: string): PrMemos {
  const next = { ...memos };
  if (text === "") {
    delete next[prNumber];
  } else {
    next[prNumber] = text;
  }
  return next;
}

export function parseMemos(raw: string | null): PrMemos {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
