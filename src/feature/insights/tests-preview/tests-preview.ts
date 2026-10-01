// server/test-cases-collect.ts の DiffedTestFile と同じ形（/api/test-cases のレスポンス）
export type Scope = "changed" | "all";

export type TestCategory = "unit" | "e2e";

export type TestCaseChange = "added" | "modified" | "removed" | "unchanged";

export type TestCaseItem = {
  kind: string;
  names: string[];
  line: number;
  dynamic: boolean;
  modifiers: string[];
  change: TestCaseChange;
};

export type TestFileItem = {
  path: string;
  framework: "go" | "jest" | "playwright" | "gherkin";
  category: TestCategory;
  changed: boolean;
  cases: TestCaseItem[];
};

export type CategorySummary = { added: number; modified: number; removed: number; total: number };

// describe などの入れ物はテストケースとして数えない
const CONTAINER_KINDS = new Set(["describe", "feature", "rule"]);

export function visibleTestFiles(files: TestFileItem[], scope: Scope): TestFileItem[] {
  if (scope === "all") return files;
  return files
    .map((f) => ({ ...f, cases: f.cases.filter((c) => c.change !== "unchanged") }))
    .filter((f) => f.cases.length > 0);
}

// total は head に存在するテストケースの数（削除されたものは含めない）
export function summarize(files: TestFileItem[]): Record<TestCategory, CategorySummary> {
  const empty = (): CategorySummary => ({ added: 0, modified: 0, removed: 0, total: 0 });
  const result = { unit: empty(), e2e: empty() };
  for (const f of files) {
    const s = result[f.category];
    for (const c of f.cases) {
      if (CONTAINER_KINDS.has(c.kind)) continue;
      if (c.change !== "unchanged") s[c.change] += 1;
      if (c.change !== "removed") s.total += 1;
    }
  }
  return result;
}
