import { describe, it, expect } from "vitest";
import { fuzzyMatch, filterDiffFiles, type DiffFileEntry } from "./diff-filters";

describe("fuzzyMatch", () => {
  it("クエリが空文字のとき全てにマッチする", () => {
    expect(fuzzyMatch("", "anything")).toBe(true);
  });

  it("完全一致でマッチする", () => {
    expect(fuzzyMatch("index.ts", "index.ts")).toBe(true);
  });

  it("部分一致でマッチする", () => {
    expect(fuzzyMatch("index", "src/index.ts")).toBe(true);
  });

  it("文字順が一致すればfuzzyマッチする", () => {
    expect(fuzzyMatch("rsapi", "rest-api")).toBe(true);
  });

  it("文字順が一致しない場合マッチしない", () => {
    expect(fuzzyMatch("xyz", "rest-api")).toBe(false);
  });

  it("大文字小文字を区別しない", () => {
    expect(fuzzyMatch("README", "readme.md")).toBe(true);
  });

  it("パスのプレフィックスでマッチする", () => {
    expect(fuzzyMatch("apps/rest-api", "apps/rest-api/src/index.ts")).toBe(true);
  });

  it("ターゲットが空文字でクエリがあるときマッチしない", () => {
    expect(fuzzyMatch("a", "")).toBe(false);
  });
});

describe("filterDiffFiles", () => {
  const files: DiffFileEntry[] = [
    { path: "apps/rest-api/src/index.ts", rawContent: "+import { session } from './auth';\n-import { old } from './legacy';" },
    { path: "apps/web/src/App.tsx", rawContent: "+const theme = 'dark';\n-const theme = 'light';" },
    { path: "libs/shared/types.ts", rawContent: "+export type Session = { id: string };\n-export type OldSession = {};" },
    { path: "README.md", rawContent: "+## Updated docs\n-## Old docs" },
  ];

  it("両方のクエリが空のとき全ファイルを返す", () => {
    expect(filterDiffFiles(files, "", "")).toEqual(files);
  });

  it("パスクエリでfuzzyフィルタできる", () => {
    const result = filterDiffFiles(files, "rest-api", "");
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("apps/rest-api/src/index.ts");
  });

  it("テキストクエリでdiff内容をフィルタできる", () => {
    const result = filterDiffFiles(files, "", "session");
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.path)).toContain("apps/rest-api/src/index.ts");
    expect(result.map((f) => f.path)).toContain("libs/shared/types.ts");
  });

  it("パスとテキスト両方指定でAND条件になる", () => {
    const result = filterDiffFiles(files, "libs", "Session");
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("libs/shared/types.ts");
  });

  it("マッチするファイルがないとき空配列を返す", () => {
    const result = filterDiffFiles(files, "nonexistent", "");
    expect(result).toHaveLength(0);
  });

  it("テキスト検索は大文字小文字を区別しない", () => {
    const result = filterDiffFiles(files, "", "SESSION");
    expect(result).toHaveLength(2);
  });
});
