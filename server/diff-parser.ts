export type FileChangedLines = {
  file: string;
  changedLines: number[];
};

export function parseDiffToChangedLines(diff: string): FileChangedLines[] {
  if (!diff.trim()) return [];

  const fileSections = diff.split(/(?=^diff --git )/m).filter(Boolean);
  const results: FileChangedLines[] = [];

  for (const section of fileSections) {
    const fileMatch = section.match(/^diff --git a\/(.+?) b\/(.+)/);
    if (!fileMatch) continue;

    const file = fileMatch[2];
    const changedLines: number[] = [];

    const hunkRegex = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/gm;
    let hunkMatch: RegExpExecArray | null;

    while ((hunkMatch = hunkRegex.exec(section)) !== null) {
      let newLineNum = parseInt(hunkMatch[1], 10);
      const hunkLineEnd = section.indexOf("\n", hunkMatch.index);
      if (hunkLineEnd === -1) continue;
      const hunkStart = hunkLineEnd + 1;
      const nextHunkOrEnd = section.indexOf("\n@@", hunkStart);
      const hunkBody = section.slice(
        hunkStart,
        nextHunkOrEnd === -1 ? undefined : nextHunkOrEnd,
      );

      for (const line of hunkBody.split("\n")) {
        if (line === "") continue;
        if (line.startsWith("+")) {
          changedLines.push(newLineNum);
          newLineNum++;
        } else if (line.startsWith("-")) {
          // deleted line
        } else {
          newLineNum++;
        }
      }
    }

    results.push({ file, changedLines });
  }

  return results;
}
