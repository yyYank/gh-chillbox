import { describe, it, expect } from "vitest";
import { parseDiff } from "./diff-parse";

const raw = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 111..222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -10,3 +10,3 @@ function foo() {",
  " keep",
  "-old",
  "+new",
  " tail",
  "@@ -30,1 +30,2 @@",
  " x",
  "+y",
].join("\n");

describe("parseDiff の行番号", () => {
  const lines = parseDiff(raw)[0].lines;

  it("hunk 行には行番号が付かない", () => {
    expect(lines[0]).toMatchObject({ type: "hunk", oldLine: null, newLine: null });
  });

  it("変更なしの行には旧・新の両方の行番号が付く", () => {
    expect(lines[1]).toMatchObject({ type: "context", content: "keep", oldLine: 10, newLine: 10 });
  });

  it("削除行には旧行番号だけが付く", () => {
    expect(lines[2]).toMatchObject({ type: "del", content: "old", oldLine: 11, newLine: null });
  });

  it("追加行には新行番号だけが付く", () => {
    expect(lines[3]).toMatchObject({ type: "add", content: "new", oldLine: null, newLine: 11 });
  });

  it("削除と追加の後の行は旧・新それぞれ進んだ番号になる", () => {
    expect(lines[4]).toMatchObject({ type: "context", content: "tail", oldLine: 12, newLine: 12 });
  });

  it("次の hunk ではヘッダーの番号から数え直す", () => {
    expect(lines[5]).toMatchObject({ type: "hunk" });
    expect(lines[6]).toMatchObject({ type: "context", oldLine: 30, newLine: 30 });
    expect(lines[7]).toMatchObject({ type: "add", oldLine: null, newLine: 31 });
  });
});
