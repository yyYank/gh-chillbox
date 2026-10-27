export function addTab(tabs: number[], prNumber: number): number[] {
  return tabs.includes(prNumber) ? tabs : [...tabs, prNumber];
}

// 表示中のタブを閉じたときは右隣、なければ左隣に移る
export function closeTab(
  tabs: number[],
  prNumber: number,
  active: number | null,
): { tabs: number[]; active: number | null } {
  const index = tabs.indexOf(prNumber);
  const next = tabs.filter((n) => n !== prNumber);
  if (active !== prNumber) {
    return { tabs: next, active };
  }
  return { tabs: next, active: next[index] ?? next[index - 1] ?? null };
}

export function moveTab(tabs: number[], from: number, to: number): number[] {
  const fromIndex = tabs.indexOf(from);
  const toIndex = tabs.indexOf(to);
  if (fromIndex === -1 || toIndex === -1) {
    return tabs;
  }
  const next = [...tabs];
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, from);
  return next;
}

export function tabTooltip(title: string | undefined, memo: string | undefined): string {
  return [title, memo && `メモ: ${memo}`].filter(Boolean).join("\n");
}

export function parseTabs(raw: string | null): number[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n): n is number => Number.isInteger(n) && n > 0) : [];
  } catch {
    return [];
  }
}

export function closeTabs(
  tabs: number[],
  prNumbers: number[],
  active: number | null,
): { tabs: number[]; active: number | null } {
  return prNumbers.reduce((acc, n) => (acc.tabs.includes(n) ? closeTab(acc.tabs, n, acc.active) : acc), {
    tabs,
    active,
  });
}

export async function fetchClosedPrs(repo: string, prNumbers: number[]): Promise<number[]> {
  const params = new URLSearchParams({ repo, numbers: prNumbers.join(",") });
  const res = await fetch(`/api/closed-prs?${params}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  const data = await res.json();
  return data.closed;
}

export function closeConfirmMessage(count: number): string {
  return `close・merge 済みの PR ${count}件のタブを閉じます`;
}
