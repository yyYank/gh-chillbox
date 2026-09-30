import { Project, Node, type CallExpression, type SourceFile } from "ts-morph";

export type TsTestFramework = "playwright" | "jest";

export type TsTestCase = {
  kind: "describe" | "test";
  names: string[];
  line: number;
  dynamic: boolean;
  modifiers: string[];
};

export type TsTestFile = { path: string; framework: TsTestFramework; cases: TsTestCase[] };

const DESCRIBE_ROOTS = new Set(["describe", "context", "suite", "fdescribe", "xdescribe"]);
const TEST_ROOTS = new Set(["it", "test", "fit", "xit", "xtest"]);
const MODIFIERS = new Set([
  "skip", "only", "todo", "each", "concurrent", "fails", "failing", "serial", "parallel", "fixme", "slow",
]);

export function extractTsTestCases(files: { path: string; content: string }[]): TsTestFile[] {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: true } });
  return files.map(({ path, content }) => {
    const sf = project.createSourceFile(path, content, { overwrite: true });
    const cases: TsTestCase[] = [];
    visit(sf, [], cases);
    return { path, framework: detectFramework(sf), cases };
  });
}

function detectFramework(sf: SourceFile): TsTestFramework {
  const usesPlaywright = sf.getImportDeclarations()
    .some((d) => d.getModuleSpecifierValue() === "@playwright/test");
  return usesPlaywright ? "playwright" : "jest";
}

function visit(node: Node, prefix: string[], cases: TsTestCase[]): void {
  node.forEachChild((child) => {
    const found = Node.isCallExpression(child) ? toTestCase(child, prefix) : null;
    if (!found) {
      visit(child, prefix, cases);
      return;
    }
    cases.push(found);
    visit(child, found.kind === "describe" ? found.names : prefix, cases);
  });
}

function toTestCase(call: CallExpression, prefix: string[]): TsTestCase | null {
  // describe.each([...])("name", fn) は外側の呼び出しの callee が内側の呼び出しになる
  const callee = call.getExpression();
  const chain = calleeChain(Node.isCallExpression(callee) ? callee.getExpression() : callee);
  if (!chain) return null;

  const [root, ...rest] = chain;
  const isDescribe = DESCRIBE_ROOTS.has(root) || (TEST_ROOTS.has(root) && rest[0] === "describe");
  if (!isDescribe && !TEST_ROOTS.has(root)) return null;

  const rawModifiers = isDescribe && rest[0] === "describe" ? rest.slice(1) : rest;
  if (!rawModifiers.every((m) => MODIFIERS.has(m))) return null;
  const modifiers = [...prefixModifier(root), ...rawModifiers];

  const args = call.getArguments();
  const [nameArg] = args;
  // test.skip(cond, "reason") のような関数を渡さない呼び出しはテストケースではない
  const hasBody = args.some((a) => Node.isArrowFunction(a) || Node.isFunctionExpression(a));
  if (!nameArg || (!hasBody && !modifiers.includes("todo"))) return null;

  const isLiteral = Node.isStringLiteral(nameArg) || Node.isNoSubstitutionTemplateLiteral(nameArg);
  const name = isLiteral ? nameArg.getLiteralText() : nameArg.getText();
  return {
    kind: isDescribe ? "describe" : "test",
    names: [...prefix, name],
    line: call.getStartLineNumber(),
    dynamic: !isLiteral,
    modifiers,
  };
}

function prefixModifier(root: string): string[] {
  if (/^x(it|test|describe)$/.test(root)) return ["skip"];
  if (/^f(it|describe)$/.test(root)) return ["only"];
  return [];
}

// test.describe.serial → ["test", "describe", "serial"]。識別子とプロパティアクセス以外が混ざれば null
function calleeChain(expr: Node): string[] | null {
  if (Node.isIdentifier(expr)) return [expr.getText()];
  if (Node.isPropertyAccessExpression(expr)) {
    const head = calleeChain(expr.getExpression());
    return head && [...head, expr.getName()];
  }
  return null;
}
