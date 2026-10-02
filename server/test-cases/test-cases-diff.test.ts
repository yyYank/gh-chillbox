import { describe, it, expect } from "vitest";
import { fromGo, fromTs, fromGherkin, diffTestCases, type TestCase } from "./test-cases-diff";

function tc(names: string[], extra: Partial<TestCase> = {}): TestCase {
  return { kind: "test", names, line: 1, dynamic: false, modifiers: [], ...extra };
}

describe("共通の形への変換", () => {
  it("Go と jest は unit、Playwright と Gherkin は e2e になる", () => {
    const go = fromGo({ path: "a_test.go", cases: [{ kind: "test", names: ["TestA"], line: 3, dynamic: false }] });
    const jest = fromTs({ path: "a.test.ts", framework: "jest", cases: [] });
    const pw = fromTs({ path: "e2e/a.spec.ts", framework: "playwright", cases: [] });
    const gherkin = fromGherkin({
      path: "a.feature",
      cases: [{ kind: "scenario", names: ["F", "S"], line: 2, modifiers: ["wip"] }],
    });
    expect([go, jest, pw, gherkin].map((f) => [f.framework, f.category])).toEqual([
      ["go", "unit"],
      ["jest", "unit"],
      ["playwright", "e2e"],
      ["gherkin", "e2e"],
    ]);
    expect(go.cases[0]).toEqual({ kind: "test", names: ["TestA"], line: 3, dynamic: false, modifiers: [] });
    expect(gherkin.cases[0]).toEqual({
      kind: "scenario",
      names: ["F", "S"],
      line: 2,
      dynamic: false,
      modifiers: ["wip"],
    });
  });
});

describe("diffTestCases", () => {
  it("kind+名前のパスで突き合わせ、head にだけあるものを added、base にだけあるものを removed にする", () => {
    const result = diffTestCases([tc(["A", "keep"]), tc(["A", "old"])], [tc(["A", "keep"]), tc(["A", "new"])]);
    expect(result.map((c) => [c.names.join(" > "), c.change])).toEqual([
      ["A > keep", "unchanged"],
      ["A > new", "added"],
      ["A > old", "removed"],
    ]);
  });

  it("skip などの修飾が変われば modified、行番号だけの変化は unchanged", () => {
    const result = diffTestCases(
      [tc(["skipped"], { line: 1 }), tc(["moved"], { line: 1 })],
      [tc(["skipped"], { line: 1, modifiers: ["skip"] }), tc(["moved"], { line: 20 })],
    );
    expect(result.map((c) => c.change)).toEqual(["modified", "unchanged"]);
  });

  it("修飾の並び順だけが違う場合は unchanged", () => {
    const [result] = diffTestCases(
      [tc(["a"], { modifiers: ["skip", "slow"] })],
      [tc(["a"], { modifiers: ["slow", "skip"] })],
    );
    expect(result.change).toBe("unchanged");
  });

  it("同じ名前のテストが複数あれば、出現順に1対1で突き合わせる", () => {
    const result = diffTestCases([tc(["dup"])], [tc(["dup"]), tc(["dup"])]);
    expect(result.map((c) => c.change)).toEqual(["unchanged", "added"]);
  });
});
