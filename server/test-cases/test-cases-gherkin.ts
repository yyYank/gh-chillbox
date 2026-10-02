export type GherkinCase = {
  kind: "feature" | "rule" | "scenario";
  names: string[];
  line: number;
  modifiers: string[];
};

export type GherkinFile = { path: string; cases: GherkinCase[] };

type Keyword = { kind: GherkinCase["kind"]; outline: boolean };

// 長いキーワードを先に並べる（"Scenario Outline" を "Scenario" より先に判定するため）
const KEYWORDS: [string, Keyword][] = [
  ["Scenario Outline", { kind: "scenario", outline: true }],
  ["Scenario Template", { kind: "scenario", outline: true }],
  ["シナリオアウトライン", { kind: "scenario", outline: true }],
  ["シナリオテンプレート", { kind: "scenario", outline: true }],
  ["シナリオテンプレ", { kind: "scenario", outline: true }],
  ["テンプレ", { kind: "scenario", outline: true }],
  ["Scenario", { kind: "scenario", outline: false }],
  ["Example", { kind: "scenario", outline: false }],
  ["シナリオ", { kind: "scenario", outline: false }],
  ["Feature", { kind: "feature", outline: false }],
  ["機能", { kind: "feature", outline: false }],
  ["フィーチャ", { kind: "feature", outline: false }],
  ["Rule", { kind: "rule", outline: false }],
  ["ルール", { kind: "rule", outline: false }],
];

export function extractGherkinCases(files: { path: string; content: string }[]): GherkinFile[] {
  return files.map(({ path, content }) => ({ path, cases: parse(content) }));
}

function parse(content: string): GherkinCase[] {
  const cases: GherkinCase[] = [];
  let feature: string | null = null;
  let rule: string | null = null;
  let tags: string[] = [];
  let docStringFence: string | null = null;

  content.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (docStringFence) {
      if (line.startsWith(docStringFence)) { docStringFence = null; }
      return;
    }
    if (line.startsWith('"""') || line.startsWith("```")) {
      docStringFence = line.slice(0, 3);
      return;
    }
    if (line.startsWith("@")) {
      tags.push(...line.split(/\s+/).filter((t) => t.startsWith("@")).map((t) => t.slice(1)));
      return;
    }

    const matched = matchKeyword(line);
    if (!matched) { return; }
    const { keyword, name } = matched;
    const modifiers = [...tags, ...(keyword.outline ? ["outline"] : [])];
    tags = [];

    if (keyword.kind === "feature") {
      feature = name;
      rule = null;
    } else if (keyword.kind === "rule") {
      rule = name;
    }
    const parents = keyword.kind === "feature" ? []
      : keyword.kind === "rule" ? [feature]
      : [feature, rule];
    cases.push({
      kind: keyword.kind,
      names: [...parents.filter((p): p is string => p !== null), name],
      line: index + 1,
      modifiers,
    });
  });
  return cases;
}

function matchKeyword(line: string): { keyword: Keyword; name: string } | null {
  for (const [word, keyword] of KEYWORDS) {
    const m = line.match(new RegExp(`^${word}\\s*[:：]\\s*(.*)$`));
    if (m) { return { keyword, name: m[1].trim() }; }
  }
  return null;
}
