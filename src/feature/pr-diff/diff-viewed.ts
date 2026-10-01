export type ViewedState = "VIEWED" | "UNVIEWED" | "DISMISSED";

export type ViewedStates = Partial<Record<string, ViewedState>>;

export function countViewed(paths: string[], states: ViewedStates): { viewed: number; total: number } {
  const viewed = paths.filter((p) => states[p] === "VIEWED").length;
  return { viewed, total: paths.length };
}
