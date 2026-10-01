import { describe, it, expect } from "vitest";
import { visibleTestFiles, summarize, type TestCaseItem, type TestFileItem } from "./tests-preview";

function tc(names: string[], change: TestCaseItem["change"], kind = "test"): TestCaseItem {
  return { kind, names, line: 1, dynamic: false, modifiers: [], change };
}

function file(path: string, category: TestFileItem["category"], cases: TestCaseItem[]): TestFileItem {
  return { path, framework: category === "e2e" ? "playwright" : "jest", category, changed: true, cases };
}

describe("visibleTestFiles", () => {
  const files = [
    file("same.test.ts", "unit", [tc(["a"], "unchanged")]),
    file("mod.test.ts", "unit", [tc(["keep"], "unchanged"), tc(["new"], "added")]),
  ];

  it("差分モードでは変わったテストケースだけを残し、変化の無いファイルは出さない", () => {
    const result = visibleTestFiles(files, "changed");
    expect(result.map((f) => [f.path, f.cases.map((c) => c.names[0])])).toEqual([["mod.test.ts", ["new"]]]);
  });

  it("全部モードではすべて返す", () => {
    expect(visibleTestFiles(files, "all").map((f) => f.cases.length)).toEqual([1, 2]);
  });
});

describe("summarize", () => {
  it("unit と e2e ごとに、テストケースの追加・変更・削除と総数を数える（describe などの入れ物は数えない）", () => {
    const result = summarize([
      file("a.test.ts", "unit", [
        tc(["A"], "added", "describe"),
        tc(["A", "x"], "added"),
        tc(["y"], "modified"),
        tc(["z"], "unchanged"),
      ]),
      file("a.feature", "e2e", [
        tc(["F"], "unchanged", "feature"),
        tc(["F", "S"], "removed", "scenario"),
      ]),
    ]);
    expect(result).toEqual({
      unit: { added: 1, modified: 1, removed: 0, total: 3 },
      e2e: { added: 0, modified: 0, removed: 1, total: 0 },
    });
  });
});
