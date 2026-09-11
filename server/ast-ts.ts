import { Project, Node, SyntaxKind } from "ts-morph";
import type { SymbolKind, SymbolRelation } from "./ast-types";

export type ExtractedSymbol = {
  name: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
};

function isReactComponent(node: Node): boolean {
  if (!Node.isFunctionDeclaration(node) && !Node.isVariableDeclaration(node)) {
    return false;
  }

  const name = node.getName();
  if (!name || !/^[A-Z]/.test(name)) return false;

  const text = node.getText();
  return /\bJSX\b|<[A-Z]|<[a-z]/.test(text) || text.includes("React.createElement");
}

function isCustomHook(name: string): boolean {
  return /^use[A-Z]/.test(name);
}

export function extractSymbolsFromFile(filePath: string): ExtractedSymbol[] {
  const project = new Project({ compilerOptions: { jsx: 2 } });
  const sourceFile = project.addSourceFileAtPath(filePath);
  const symbols: ExtractedSymbol[] = [];

  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;

    let kind: SymbolKind = "function";
    if (isCustomHook(name)) {
      kind = "hook";
    } else if (isReactComponent(fn)) {
      kind = "component";
    }

    symbols.push({
      name,
      kind,
      startLine: fn.getStartLineNumber(),
      endLine: fn.getEndLineNumber(),
    });
  }

  for (const cls of sourceFile.getClasses()) {
    const name = cls.getName();
    if (!name) continue;

    symbols.push({
      name,
      kind: "class",
      startLine: cls.getStartLineNumber(),
      endLine: cls.getEndLineNumber(),
    });

    for (const method of cls.getMethods()) {
      symbols.push({
        name: method.getName(),
        kind: "method",
        startLine: method.getStartLineNumber(),
        endLine: method.getEndLineNumber(),
      });
    }
  }

  for (const iface of sourceFile.getInterfaces()) {
    symbols.push({
      name: iface.getName(),
      kind: "interface",
      startLine: iface.getStartLineNumber(),
      endLine: iface.getEndLineNumber(),
    });
  }

  for (const ta of sourceFile.getTypeAliases()) {
    symbols.push({
      name: ta.getName(),
      kind: "type",
      startLine: ta.getStartLineNumber(),
      endLine: ta.getEndLineNumber(),
    });
  }

  for (const varStmt of sourceFile.getVariableStatements()) {
    for (const decl of varStmt.getDeclarations()) {
      const init = decl.getInitializer();
      if (!init) continue;
      if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) {
        const name = decl.getName();
        let kind: SymbolKind = "function";
        if (isCustomHook(name)) {
          kind = "hook";
        } else if (isReactComponent(decl)) {
          kind = "component";
        }
        symbols.push({
          name,
          kind,
          startLine: varStmt.getStartLineNumber(),
          endLine: varStmt.getEndLineNumber(),
        });
      }
    }
  }

  return symbols;
}

export type ExtractedRelation = {
  from: string;
  to: string;
  kind: SymbolRelation["kind"];
};

export function extractRelationsFromFile(filePath: string): ExtractedRelation[] {
  const project = new Project({ compilerOptions: { jsx: 2 } });
  const sourceFile = project.addSourceFileAtPath(filePath);
  const symbols = extractSymbolsFromFile(filePath);
  const symbolNames = new Set(symbols.map((s) => s.name));
  const relations: ExtractedRelation[] = [];
  const seen = new Set<string>();

  function addRelation(from: string, to: string, kind: ExtractedRelation["kind"]) {
    const key = `${from}:${to}:${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    relations.push({ from, to, kind });
  }

  function findContainingSymbol(line: number): string | undefined {
    for (const sym of symbols) {
      if (line >= sym.startLine && line <= sym.endLine) {
        return sym.name;
      }
    }
    return undefined;
  }

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    const line = call.getStartLineNumber();
    const caller = findContainingSymbol(line);
    if (!caller) continue;

    if (Node.isIdentifier(expr)) {
      const name = expr.getText();
      if (symbolNames.has(name) && name !== caller) {
        const kind = isCustomHook(name) ? "hook-use" : "call";
        addRelation(caller, name, kind);
      }
    } else if (Node.isPropertyAccessExpression(expr)) {
      const methodName = expr.getName();
      if (symbolNames.has(methodName) && methodName !== caller) {
        addRelation(caller, methodName, "method-call");
      }
    }
  }

  for (const jsx of sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    const tagName = jsx.getTagNameNode().getText();
    if (symbolNames.has(tagName)) {
      const line = jsx.getStartLineNumber();
      const caller = findContainingSymbol(line);
      if (caller && caller !== tagName) {
        addRelation(caller, tagName, "component-use");
      }
    }
  }

  for (const jsx of sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    const tagName = jsx.getTagNameNode().getText();
    if (symbolNames.has(tagName)) {
      const line = jsx.getStartLineNumber();
      const caller = findContainingSymbol(line);
      if (caller && caller !== tagName) {
        addRelation(caller, tagName, "component-use");
      }
    }
  }

  return relations;
}
