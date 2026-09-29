export type DiffLine = {
  type: "add" | "del" | "context" | "hunk";
  content: string;
  oldLine: number | null;
  newLine: number | null;
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
    let oldLine = 0;
    let newLine = 0;

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
        const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/);
        if (m) {
          oldLine = parseInt(m[1], 10);
          newLine = parseInt(m[2], 10);
        }
        lines.push({ type: "hunk", content: line, oldLine: null, newLine: null });
      } else if (line.startsWith("+")) {
        additions++;
        lines.push({ type: "add", content: line.slice(1), oldLine: null, newLine: newLine++ });
      } else if (line.startsWith("-")) {
        deletions++;
        lines.push({ type: "del", content: line.slice(1), oldLine: oldLine++, newLine: null });
      } else if (line !== "\\ No newline at end of file") {
        lines.push({
          type: "context",
          content: line.startsWith(" ") ? line.slice(1) : line,
          oldLine: oldLine++,
          newLine: newLine++,
        });
      }
    }

    return { path, additions, deletions, lines, rawContent: section };
  });
}
