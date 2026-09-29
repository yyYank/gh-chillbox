export type DiffLine = {
  type: "add" | "del" | "context" | "hunk";
  content: string;
};

export type DiffFile = {
  path: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
  rawContent: string;
};

export function parseDiff(raw: string): DiffFile[] {
  const sections = raw.split(/(?=^diff --git )/m).filter(Boolean);
  return sections.map((section) => {
    const sectionLines = section.split("\n");
    const match = sectionLines[0].match(/^diff --git a\/.+? b\/(.+)/);
    const path = match ? match[1] : "unknown";

    let additions = 0;
    let deletions = 0;
    const lines: DiffLine[] = [];

    for (const line of sectionLines) {
      if (
        line.startsWith("diff --git") ||
        line.startsWith("index ") ||
        line.startsWith("--- ") ||
        line.startsWith("+++ ") ||
        line.startsWith("new file") ||
        line.startsWith("deleted file")
      ) {
        continue;
      }
      if (line.startsWith("@@")) {
        lines.push({ type: "hunk", content: line });
      } else if (line.startsWith("+")) {
        additions++;
        lines.push({ type: "add", content: line.slice(1) });
      } else if (line.startsWith("-")) {
        deletions++;
        lines.push({ type: "del", content: line.slice(1) });
      } else if (line !== "\\ No newline at end of file") {
        lines.push({ type: "context", content: line.startsWith(" ") ? line.slice(1) : line });
      }
    }

    return { path, additions, deletions, lines, rawContent: section };
  });
}
