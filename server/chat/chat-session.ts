// PR 全体の Chat と、diff 行範囲ごとの Chat をそれぞれ別の claude セッションにする
export function chatSessionKey({
  repo,
  prNumber,
  threadKey,
}: {
  repo: string;
  prNumber: number;
  threadKey?: string;
}): string {
  return threadKey ? `${repo}:${prNumber}:${threadKey}` : `${repo}:${prNumber}`;
}
