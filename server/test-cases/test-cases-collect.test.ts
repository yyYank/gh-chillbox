import { describe, it, expect } from "vitest";
import { testFileKind, extractTestFiles, mergeTestFiles } from "./test-cases-collect";
import type { TestFile, TestCase } from "./test-cases-diff";

function tc(name: string): TestCase {
  return { kind: "test", names: [name], line: 1, dynamic: false, modifiers: [] };
}

function file(path: string, names: string[]): TestFile {
  return { path, framework: "jest", category: "unit", cases: names.map(tc) };
}

describe("testFileKind", () => {
  it("Go・TS/JS・Gherkin のテストファイルを見分ける", () => {
    expect(testFileKind("user/user_test.go")).toBe("go");
    expect(testFileKind("src/a.test.ts")).toBe("ts");
    expect(testFileKind("e2e/login.spec.tsx")).toBe("ts");
    expect(testFileKind("src/__tests__/util.js")).toBe("ts");
    expect(testFileKind("features/login.feature")).toBe("gherkin");
  });

  it("テストでないファイルは null", () => {
    expect(testFileKind("user/user.go")).toBeNull();
    expect(testFileKind("src/a.ts")).toBeNull();
    expect(testFileKind("src/a.test.ts.snap")).toBeNull();
    expect(testFileKind("cypress/e2e/a.cy.ts")).toBeNull();
  });
});

describe("extractTestFiles", () => {
  it("種類ごとに抽出して、共通の形にまとめる", async () => {
    const files = await extractTestFiles([
      { path: "a_test.go", content: 'package a\nimport "testing"\nfunc TestA(t *testing.T) {}\n' },
      { path: "a.test.ts", content: `it("a", () => {});` },
      { path: "a.feature", content: "Feature: F\n  Scenario: S\n" },
    ]);
    expect(files.map((f) => [f.path, f.framework, f.cases.length])).toEqual([
      ["a.feature", "gherkin", 2],
      ["a.test.ts", "jest", 1],
      ["a_test.go", "go", 1],
    ]);
  });
});

describe("mergeTestFiles", () => {
  it("変更されていないファイルのテストはすべて unchanged", () => {
    const [result] = mergeTestFiles([], [file("a.test.ts", ["x"])], new Set());
    expect(result.changed).toBe(false);
    expect(result.cases.map((c) => c.change)).toEqual(["unchanged"]);
  });

  it("変更されたファイルは base と比べ、PR で追加・削除されたファイルも扱う", () => {
    const result = mergeTestFiles(
      [file("mod.test.ts", ["keep", "old"]), file("gone.test.ts", ["g"])],
      [file("mod.test.ts", ["keep", "new"]), file("new.test.ts", ["n"])],
      new Set(["mod.test.ts", "gone.test.ts", "new.test.ts"]),
    );
    expect(result.map((f) => [f.path, f.cases.map((c) => `${c.names[0]}:${c.change}`)])).toEqual([
      ["gone.test.ts", ["g:removed"]],
      ["mod.test.ts", ["keep:unchanged", "new:added", "old:removed"]],
      ["new.test.ts", ["n:added"]],
    ]);
  });
});
