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

// 状態を取れなかった PR は閉じないよう open とみなす
export async function closedPrNumbers(
  prNumbers: number[],
  viewState: (prNumber: number) => Promise<string>,
): Promise<number[]> {
  const results = await Promise.all(
    prNumbers.map(async (n) => {
      try {
        return parsePrState(await viewState(n)) === "open" ? null : n;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((n): n is number => n !== null);
}
