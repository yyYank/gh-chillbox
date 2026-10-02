import { describe, it, expect } from "vitest";
import { isMarkdown, markdownFromDiff } from "./diff-markdown";
import type { DiffLine } from "./diff-parse";

describe("isMarkdown", () => {
  it(".md と .markdown を markdown として扱う", () => {
    expect(isMarkdown("README.md")).toBe(true);
    expect(isMarkdown("docs/adr/001.MD")).toBe(true);
    expect(isMarkdown("notes.markdown")).toBe(true);
  });

  it("markdown 以外の拡張子は扱わない", () => {
    expect(isMarkdown("src/App.tsx")).toBe(false);
    expect(isMarkdown("md")).toBe(false);
  });
});

describe("markdownFromDiff", () => {
  const line = (type: DiffLine["type"], content: string): DiffLine => ({ type, content, oldLine: null, newLine: null });

  it("削除行を除いた変更後の行を hunk ごとにまとめる", () => {
    const lines = [
      line("hunk", "@@ -1,2 +1,2 @@"),
      line("context", "# Title"),
      line("del", "old"),
      line("add", "new"),
      line("hunk", "@@ -10,1 +10,2 @@"),
      line("add", "- item"),
    ];
    expect(markdownFromDiff(lines)).toEqual(["# Title\nnew", "- item"]);
  });

  it("変更後の行が無い hunk は含めない", () => {
    const lines = [line("hunk", "@@ -1,1 +0,0 @@"), line("del", "gone")];
    expect(markdownFromDiff(lines)).toEqual([]);
  });
});
