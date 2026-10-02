import type { DiffFile, DiffLine } from "./diff-parse";

export type ThreadMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ThreadAnchor = {
  key: string;
  path: string;
  start: string;
  end: string;
  code: string;
};

export type DiffThread = ThreadAnchor & {
  messages: ThreadMessage[];
};

// GitHub と同じく、新ファイル側の行は R、削除行は L で表す
export function lineLabel(line: DiffLine): string | null {
  if (line.newLine !== null) { return `R${line.newLine}`; }
  if (line.oldLine !== null) { return `L${line.oldLine}`; }
  return null;
}

export function buildThreadAnchor(file: DiffFile, fromIdx: number, toIdx: number): ThreadAnchor | null {
  const [lo, hi] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
  const lines = file.lines.slice(lo, hi + 1).filter((l) => l.type !== "hunk");
  if (lines.length === 0) { return null; }

  const start = lineLabel(lines[0])!;
  const end = lineLabel(lines[lines.length - 1])!;
  const marker = (l: DiffLine) => (l.type === "add" ? "+" : l.type === "del" ? "-" : " ");
  const code = lines.map((l) => marker(l) + l.content).join("\n");

  return { key: `${file.path}:${start}-${end}`, path: file.path, start, end, code };
}
