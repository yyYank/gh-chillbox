// 一括送信ではまだ開いていないタブの PR 本文を画面が持っていないので、gh pr view の値で補う
export function fillPrInfo(
  sent: { prTitle?: string; prBody?: string },
  view: { title: string; body: string },
): { prTitle: string; prBody: string } {
  return { prTitle: sent.prTitle ?? view.title, prBody: sent.prBody ?? view.body };
}
