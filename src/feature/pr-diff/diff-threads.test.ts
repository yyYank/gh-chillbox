import { describe, it, expect } from "vitest";
import { parseDiff } from "./diff-parse";
import { lineLabel, buildThreadAnchor } from "./diff-threads";

const file = parseDiff([
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -10,3 +10,3 @@",
  " keep",
  "-old",
  "+new",
  " tail",
].join("\n"))[0];

describe("lineLabel", () => {
  it("新行番号がある行は R+新行番号になる", () => {
    expect(lineLabel(file.lines[1])).toBe("R10");
    expect(lineLabel(file.lines[3])).toBe("R11");
  });

  it("削除行は L+旧行番号になる", () => {
    expect(lineLabel(file.lines[2])).toBe("L11");
  });

  it("hunk 行は null になる", () => {
    expect(lineLabel(file.lines[0])).toBeNull();
  });
});

describe("buildThreadAnchor", () => {
  it("複数行の選択は1つのスレッドにまとまり、キーはファイルと開始-終了行になる", () => {
    const anchor = buildThreadAnchor(file, 1, 4);
    expect(anchor).toMatchObject({ key: "src/a.ts:R10-R12", path: "src/a.ts", start: "R10", end: "R12" });
  });

  it("コードは +/- 付きで選択範囲の行だけを含む", () => {
    expect(buildThreadAnchor(file, 2, 3)?.code).toBe("-old\n+new");
  });

  it("1行だけの選択は開始と終了が同じになる", () => {
    expect(buildThreadAnchor(file, 3, 3)).toMatchObject({ key: "src/a.ts:R11-R11", start: "R11", end: "R11" });
  });

  it("範囲の端にある hunk 行は除いて開始行を決める", () => {
    expect(buildThreadAnchor(file, 0, 1)).toMatchObject({ start: "R10", end: "R10", code: " keep" });
  });

  it("hunk 行だけの選択はスレッドを作らない", () => {
    expect(buildThreadAnchor(file, 0, 0)).toBeNull();
  });

  it("開始と終了が逆順でも同じスレッドになる", () => {
    expect(buildThreadAnchor(file, 4, 1)?.key).toBe("src/a.ts:R10-R12");
  });
});
