export type SwiftTestFramework = "xctest" | "xcuitest" | "swift-testing";

export type SwiftTestCase = {
  kind: "describe" | "test";
  names: string[];
  line: number;
  modifiers: string[];
};

export type SwiftTestFile = { path: string; framework: SwiftTestFramework; cases: SwiftTestCase[] };

type Container = {
  names: string[];
  line: number;
  modifiers: string[];
  depth: number;
  opened: boolean;
  xctest: boolean;
  emitted: boolean;
};

type ScanState = { inBlockComment: boolean; inMultilineString: boolean };

const DECL = /\b(func|struct|class|enum|actor|extension)\s+([A-Za-z_]\w*)/;

// XCTest も Testing も import していないファイルはテストではないので返さない
export function extractSwiftTestCases(files: { path: string; content: string }[]): SwiftTestFile[] {
  return files.flatMap(({ path, content }) => {
    const framework = detectFramework(content);
    return framework ? [{ path, framework, cases: parse(content) }] : [];
  });
}

function detectFramework(content: string): SwiftTestFramework | null {
  const xctest = /^\s*import\s+XCTest\b/m.test(content);
  const testing = /^\s*import\s+Testing\b/m.test(content);
  if (!xctest && !testing) {
    return null;
  }
  if (xctest && /\bXCUIApplication\b/.test(content)) {
    return "xcuitest";
  }
  return testing && (!xctest || /@Test\b/.test(content)) ? "swift-testing" : "xctest";
}

// ライブラリを使わず行ごとに読む。波かっこの深さで型の入れ子を追い、属性は宣言の行まで持ち越す
function parse(content: string): SwiftTestCase[] {
  const cases: SwiftTestCase[] = [];
  const stack: Container[] = [];
  const state: ScanState = { inBlockComment: false, inMultilineString: false };
  let depth = 0;
  let pending: string | null = null;

  const emit = (c: Container) => {
    if (!c.emitted) {
      c.emitted = true;
      cases.push({ kind: "describe", names: c.names, line: c.line, modifiers: c.modifiers });
    }
  };

  content.split(/\r?\n/).forEach((raw, index) => {
    const code = stripComments(raw, state);
    const structure = code.replace(/"(?:\\.|[^"\\])*"/g, '""');
    const trimmed = structure.trim();

    const attrLine = trimmed.startsWith("@") || (pending !== null && !balanced(pending));
    if (attrLine) {
      pending = `${pending ?? ""} ${code}`;
    }
    const decl = structure.match(DECL);
    if (decl) {
      const attrs = attrLine ? (pending ?? "") : `${pending ?? ""} ${code}`;
      pending = null;
      const [, keyword, name] = decl;
      const parent = stack.at(-1);
      const modifiers = /\.disabled\s*\(/.test(attrs) ? ["skip"] : [];
      if (keyword === "func") {
        const swiftTesting = /@Test\b/.test(attrs);
        const xctest =
          parent?.xctest === true && depth === parent.depth + 1 && /\bfunc\s+test\w*\s*\(\s*\)/.test(structure);
        if (swiftTesting || xctest) {
          stack.forEach(emit);
          const label = (swiftTesting && displayName(attrs, "Test")) || name;
          cases.push({ kind: "test", names: [...(parent?.names ?? []), label], line: index + 1, modifiers });
        }
      } else {
        const suite = /@Suite\b/.test(attrs);
        const container: Container = {
          names: [...(parent?.names ?? []), (suite && displayName(attrs, "Suite")) || name],
          line: index + 1,
          modifiers,
          depth,
          opened: false,
          xctest: keyword === "class" && /:[^{]*\bXCTestCase\b/.test(structure),
          emitted: false,
        };
        stack.push(container);
        if (suite || container.xctest) {
          stack.forEach(emit);
        }
      }
    } else if (!attrLine && trimmed !== "") {
      pending = null;
    }

    for (const ch of structure) {
      if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
      }
    }
    const top = stack.at(-1);
    if (top && depth > top.depth) {
      top.opened = true;
    }
    while (stack.length > 0 && stack[stack.length - 1].opened && depth <= stack[stack.length - 1].depth) {
      stack.pop();
    }
  });
  return cases;
}

// コメントを除き、複数行の文字列は中身を捨てて "" に置き換える。1行の文字列はそのまま残す
function stripComments(line: string, state: ScanState): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (state.inBlockComment || state.inMultilineString) {
      const close = state.inBlockComment ? "*/" : '"""';
      const end = line.indexOf(close, i);
      if (end < 0) {
        return out;
      }
      state.inBlockComment = false;
      state.inMultilineString = false;
      i = end + close.length;
      continue;
    }
    if (line.startsWith("//", i)) {
      return out;
    }
    if (line.startsWith("/*", i)) {
      state.inBlockComment = true;
      i += 2;
      continue;
    }
    if (line.startsWith('"""', i)) {
      state.inMultilineString = true;
      out += '""';
      i += 3;
      continue;
    }
    if (line[i] === '"') {
      const m = line.slice(i).match(/^"(?:\\.|[^"\\])*"?/);
      const literal = m ? m[0] : '"';
      out += literal;
      i += literal.length;
      continue;
    }
    out += line[i];
    i += 1;
  }
  return out;
}

function balanced(text: string): boolean {
  const s = text.replace(/"(?:\\.|[^"\\])*"/g, '""');
  return (s.match(/\(/g)?.length ?? 0) <= (s.match(/\)/g)?.length ?? 0);
}

// @Test("表示名") / @Suite("表示名") の最初の引数が文字列なら、それを名前にする
function displayName(attrs: string, attribute: "Test" | "Suite"): string | null {
  const m = attrs.match(new RegExp(`@${attribute}\\s*\\(\\s*"((?:\\\\.|[^"\\\\])*)"`));
  return m ? m[1] : null;
}
