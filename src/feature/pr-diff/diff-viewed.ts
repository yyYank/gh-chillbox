export type ViewedState = "VIEWED" | "UNVIEWED" | "DISMISSED";

export type ViewedStates = Partial<Record<string, ViewedState>>;

export function countViewed(paths: string[], states: ViewedStates): { viewed: number; total: number } {
  const viewed = paths.filter((p) => states[p] === "VIEWED").length;
  return { viewed, total: paths.length };
}

// 自分で開け閉めしたときの状態と、そのときに viewed だったか
export type FoldRecords = Record<string, { collapsed: boolean; viewed: boolean }>;

// GitHub は viewed を変えた時刻を返さないので、記録時の viewed と違えば GitHub 側で変えたとみなして合わせる
export function resolveCollapsed(records: FoldRecords, states: ViewedStates | null): Set<string> {
  const collapsed = new Set<string>();
  if (!states) {
    for (const [path, r] of Object.entries(records)) {
      if (r.collapsed) {
        collapsed.add(path);
      }
    }
    return collapsed;
  }
  for (const path of new Set([...Object.keys(records), ...Object.keys(states)])) {
    const viewed = states[path] === "VIEWED";
    const r = records[path];
    if (r && r.viewed === viewed ? r.collapsed : viewed) {
      collapsed.add(path);
    }
  }
  return collapsed;
}
