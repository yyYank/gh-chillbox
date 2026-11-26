type Open = (url: string, target: string) => unknown;

// 一覧から複数の PR を並べて見られるよう、PR 詳細はブラウザの別タブで開く
export function openPrDetailInNewTab(prNumber: number, open: Open = (url, target) => window.open(url, target)) {
  open(`/pr-detail?id=${prNumber}`, "_blank");
}
