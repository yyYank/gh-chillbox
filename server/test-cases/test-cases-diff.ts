import type { GoTestFile } from "./test-cases-go";
import type { TsTestFile } from "./test-cases-ts";
import type { GherkinFile } from "./test-cases-gherkin";

export type TestFramework = "go" | "jest" | "playwright" | "gherkin";

export type TestCategory = "unit" | "e2e";

export type TestCase = {
  kind: string;
  names: string[];
  line: number;
  dynamic: boolean;
  modifiers: string[];
};

export type TestFile = {
  path: string;
  framework: TestFramework;
  category: TestCategory;
  cases: TestCase[];
};

export type TestCaseChange = "added" | "modified" | "removed" | "unchanged";

export type DiffedTestCase = TestCase & { change: TestCaseChange };

const E2E_FRAMEWORKS = new Set<TestFramework>(["playwright", "gherkin"]);

function toFile(path: string, framework: TestFramework, cases: TestCase[]): TestFile {
  return { path, framework, category: E2E_FRAMEWORKS.has(framework) ? "e2e" : "unit", cases };
}

export function fromGo(f: GoTestFile): TestFile {
  return toFile(f.path, "go", f.cases.map((c) => ({ ...c, modifiers: [] })));
}

export function fromTs(f: TsTestFile): TestFile {
  return toFile(f.path, f.framework, f.cases);
}

export function fromGherkin(f: GherkinFile): TestFile {
  return toFile(f.path, "gherkin", f.cases.map((c) => ({ ...c, dynamic: false })));
}

// 同じ名前のテストが複数あっても1対1で突き合わせられるよう、出現回数をキーに含める
function keyed(cases: TestCase[]): [string, TestCase][] {
  const seen = new Map<string, number>();
  return cases.map((c) => {
    const base = [c.kind, ...c.names].join("\u0000");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return [`${base}#${n}`, c];
  });
}

function sameModifiers(a: string[], b: string[]): boolean {
  return [...a].sort().join(",") === [...b].sort().join(",");
}

// head の並び順を保ち、base にだけあるテストは末尾に removed として足す
export function diffTestCases(base: TestCase[], head: TestCase[]): DiffedTestCase[] {
  const baseKeyed = keyed(base);
  const baseByKey = new Map(baseKeyed);
  const headKeyed = keyed(head);
  const headKeys = new Set(headKeyed.map(([k]) => k));

  const current = headKeyed.map(([k, c]): DiffedTestCase => {
    const before = baseByKey.get(k);
    if (!before) return { ...c, change: "added" };
    return { ...c, change: sameModifiers(before.modifiers, c.modifiers) ? "unchanged" : "modified" };
  });
  const removed = baseKeyed
    .filter(([k]) => !headKeys.has(k))
    .map(([, c]): DiffedTestCase => ({ ...c, change: "removed" }));

  return [...current, ...removed];
}
