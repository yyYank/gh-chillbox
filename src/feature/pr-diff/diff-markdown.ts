import type { DiffLine } from "./diff-parse";

export function isMarkdown(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

// 差分の preview 用に、削除行を除いた変更後の行を hunk ごとの markdown 文字列にする
export function markdownFromDiff(lines: DiffLine[]): string[] {
  const chunks: string[][] = [];
  for (const l of lines) {
    if (l.type === "hunk") { chunks.push([]); }
    else if (l.type !== "del") {
      if (chunks.length === 0) { chunks.push([]); }
      chunks[chunks.length - 1].push(l.content);
    }
  }
  return chunks.filter((c) => c.length > 0).map((c) => c.join("\n"));
}
