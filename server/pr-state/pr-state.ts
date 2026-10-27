export type PrState = "open" | "closed" | "merged";

// gh pr view --json state --jq .state の出力を状態に変換する
export function parsePrState(stdout: string): PrState {
  const s = stdout.trim().toUpperCase();
  if (s === "MERGED") {
    return "merged";
  }
  if (s === "CLOSED") {
    return "closed";
  }
  return "open";
}
