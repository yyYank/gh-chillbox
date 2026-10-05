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
