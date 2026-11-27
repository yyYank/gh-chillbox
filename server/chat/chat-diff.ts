type DiffTarget = {
  files?: string[];
  includeDiff?: boolean;
  quotedText?: string;
  diffThread?: unknown;
};

// diff 行スレッド・引用テキストの質問では diff を使わないので、ファイル選択かつ diff 込みのときだけ取る
function needsDiff({ files, includeDiff, quotedText, diffThread }: DiffTarget): boolean {
  return !diffThread && !quotedText && !!files && files.length > 0 && !!includeDiff;
}

// 呼んだ時点で取得を始めるので、await を後ろに置けば他の処理と並列に走る
export function startDiffFetch(target: DiffTarget, fetchDiff: () => Promise<string>): Promise<string | null> {
  if (!needsDiff(target)) {
    return Promise.resolve(null);
  }
  // 取得に失敗してもファイル一覧だけで続行する
  return fetchDiff().catch(() => null);
}
