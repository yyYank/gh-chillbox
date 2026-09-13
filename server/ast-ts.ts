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

export type HttpCall = {
  caller: string;
  method?: string;
  path: string;
  file: string;
};

export type HttpRoute = {
  handler: string;
  method?: string;
  path: string;
  file: string;
};

export function extractRelationsFromFile(
  filePath: string,
  globalSymbolNames?: Set<string>,
): ExtractedRelation[] {
  const project = new Project({ compilerOptions: { jsx: 2 } });
  const sourceFile = project.addSourceFileAtPath(filePath);
  const symbols = extractSymbolsFromFile(filePath);
  const localNames = new Set(symbols.map((s) => s.name));
  const matchNames = globalSymbolNames
    ? new Set([...localNames, ...globalSymbolNames])
    : localNames;
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
      if (matchNames.has(name) && name !== caller) {
        const kind = isCustomHook(name) ? "hook-use" : "call";
        addRelation(caller, name, kind);
      }
    } else if (Node.isPropertyAccessExpression(expr)) {
      const methodName = expr.getName();
      if (matchNames.has(methodName) && methodName !== caller) {
        addRelation(caller, methodName, "method-call");
      }
    }
  }

  for (const jsx of sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    const tagName = jsx.getTagNameNode().getText();
    if (matchNames.has(tagName)) {
      const line = jsx.getStartLineNumber();
      const caller = findContainingSymbol(line);
      if (caller && caller !== tagName) {
        addRelation(caller, tagName, "component-use");
      }
    }
  }

  for (const jsx of sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    const tagName = jsx.getTagNameNode().getText();
    if (matchNames.has(tagName)) {
      const line = jsx.getStartLineNumber();
      const caller = findContainingSymbol(line);
      if (caller && caller !== tagName) {
        addRelation(caller, tagName, "component-use");
      }
    }
  }

  return relations;
}

const HTTP_METHODS = new Set(["get", "post", "put", "delete", "patch"]);

function extractUrlPath(node: Node): string | null {
  if (Node.isStringLiteral(node)) {
    const val = node.getLiteralValue();
    if (val.startsWith("/")) return val;
  }
  if (Node.isTemplateExpression(node)) {
    const head = node.getHead().getLiteralText();
    if (head.startsWith("/")) {
      const spans = node.getTemplateSpans();
      let path = head;
      for (const span of spans) {
        path += "*" + span.getLiteral().getLiteralText();
      }
      return path;
    }
    const spans = node.getTemplateSpans();
    for (let i = 0; i < spans.length; i++) {
      const lit = spans[i].getLiteral().getLiteralText();
      if (lit.startsWith("/")) {
        let path = lit;
        for (let j = i + 1; j < spans.length; j++) {
          path += "*" + spans[j].getLiteral().getLiteralText();
        }
        return path;
      }
    }
  }
  if (Node.isNoSubstitutionTemplateLiteral(node)) {
    const val = node.getLiteralValue();
    if (val.startsWith("/")) return val;
  }
  return null;
}

export function normalizePath(p: string): string {
  return p.replace(/\/+$/, "").replace(/:[^/]+/g, "*").replace(/\*/g, "*").toLowerCase();
}

function matchSegments(a: string[], b: string[], offset: number): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "*" || b[offset + i] === "*") continue;
    if (a[i] !== b[offset + i]) return false;
  }
  return true;
}

export function matchPaths(a: string, b: string): boolean {
  const na = normalizePath(a);
  const nb = normalizePath(b);
  if (na === nb) return true;
  const segA = na.split("/").filter(Boolean);
  const segB = nb.split("/").filter(Boolean);
  const shorter = segA.length <= segB.length ? segA : segB;
  const longer = segA.length <= segB.length ? segB : segA;
  if (shorter.length === 0) return false;
  if (matchSegments(shorter, longer, 0)) return true;
  const suffixOffset = longer.length - shorter.length;
  if (suffixOffset === 1 && matchSegments(shorter, longer, suffixOffset)) return true;
  return false;
}

const APP_ROUTER_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);

export function inferRoutePathFromFilePath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/");
  const appIdx = normalized.indexOf("/app/");
  if (appIdx === -1) return null;
  const relative = normalized.slice(appIdx + "/app".length);
  const dir = relative.replace(/\/route\.(ts|tsx|js|jsx)$/, "");
  if (dir === relative) return null;
  return dir.replace(/\[([^\]]+)\]/g, ":$1").replace(/\/\(([^)]+)\)/g, "");
}

export function extractHttpFromFile(
  filePath: string,
): { calls: HttpCall[]; routes: HttpRoute[] } {
  const project = new Project({ compilerOptions: { jsx: 2 } });
  const sourceFile = project.addSourceFileAtPath(filePath);
  const symbols = extractSymbolsFromFile(filePath);
  const calls: HttpCall[] = [];
  const routes: HttpRoute[] = [];

  const routePath = inferRoutePathFromFilePath(filePath);
  if (routePath) {
    for (const fn of sourceFile.getFunctions()) {
      const name = fn.getName();
      if (name && fn.isExported() && APP_ROUTER_METHODS.has(name)) {
        routes.push({ handler: `${name} ${routePath}`, path: routePath, file: filePath });
      }
    }
    for (const stmt of sourceFile.getVariableStatements()) {
      if (!stmt.isExported()) continue;
      for (const decl of stmt.getDeclarations()) {
        const name = decl.getName();
        if (APP_ROUTER_METHODS.has(name)) {
          routes.push({ handler: `${name} ${routePath}`, path: routePath, file: filePath });
        }
      }
    }
  }

  function findContaining(line: number): string | undefined {
    for (const sym of symbols) {
      if (line >= sym.startLine && line <= sym.endLine) return sym.name;
    }
    return undefined;
  }

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    const args = call.getArguments();
    if (args.length === 0) continue;

    const urlPath = extractUrlPath(args[0]);
    if (!urlPath) continue;
    const line = call.getStartLineNumber();

    if (Node.isIdentifier(expr)) {
      const caller = findContaining(line);
      if (caller) {
        calls.push({ caller, path: urlPath, file: filePath });
      }
    } else if (Node.isPropertyAccessExpression(expr)) {
      const methodName = expr.getName().toLowerCase();

      if (HTTP_METHODS.has(methodName)) {
        const handlerArg = args[args.length - 1];
        const hasHandlerArg = args.length >= 2 && (
          Node.isIdentifier(handlerArg) ||
          Node.isArrowFunction(handlerArg) ||
          Node.isFunctionExpression(handlerArg)
        );

        if (hasHandlerArg) {
          let handlerName: string | undefined;
          if (Node.isIdentifier(handlerArg)) {
            handlerName = handlerArg.getText();
          }
          if (handlerName) {
            routes.push({ handler: handlerName, path: urlPath, file: filePath });
          } else {
            const caller = findContaining(line);
            if (caller) {
              routes.push({ handler: caller, path: urlPath, file: filePath });
            }
          }
        } else {
          const caller = findContaining(line);
          if (caller) {
            calls.push({ caller, path: urlPath, file: filePath });
          }
        }
      } else {
        const caller = findContaining(line);
        if (caller) {
          calls.push({ caller, path: urlPath, file: filePath });
        }
      }
    }
  }

  return { calls, routes };
}

export function extractServerActionExports(filePath: string): string[] {
  const project = new Project({ compilerOptions: { jsx: 2 } });
  const sourceFile = project.addSourceFileAtPath(filePath);
  const text = sourceFile.getFullText();
  if (!text.includes('"use server"') && !text.includes("'use server'")) return [];

  const names: string[] = [];
  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    if (name && fn.isExported()) names.push(name);
  }
  for (const stmt of sourceFile.getVariableStatements()) {
    if (!stmt.isExported()) continue;
    for (const decl of stmt.getDeclarations()) {
      const init = decl.getInitializer();
      if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        names.push(decl.getName());
      }
    }
  }
  return names;
}

export type TsFileAnalysis = {
  symbols: ExtractedSymbol[];
  relations: ExtractedRelation[];
  httpCalls: HttpCall[];
  httpRoutes: HttpRoute[];
  serverActionExports: string[];
};

export function analyzeTsFile(
  filePath: string,
  globalSymbolNames?: Set<string>,
): TsFileAnalysis {
  const project = new Project({ compilerOptions: { jsx: 2 } });
  const sourceFile = project.addSourceFileAtPath(filePath);

  // symbols
  const symbols: ExtractedSymbol[] = [];

  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;
    let kind: SymbolKind = "function";
    if (isCustomHook(name)) kind = "hook";
    else if (isReactComponent(fn)) kind = "component";
    symbols.push({ name, kind, startLine: fn.getStartLineNumber(), endLine: fn.getEndLineNumber() });
  }

  for (const cls of sourceFile.getClasses()) {
    const name = cls.getName();
    if (!name) continue;
    symbols.push({ name, kind: "class", startLine: cls.getStartLineNumber(), endLine: cls.getEndLineNumber() });
    for (const method of cls.getMethods()) {
      symbols.push({ name: method.getName(), kind: "method", startLine: method.getStartLineNumber(), endLine: method.getEndLineNumber() });
    }
  }

  for (const iface of sourceFile.getInterfaces()) {
    symbols.push({ name: iface.getName(), kind: "interface", startLine: iface.getStartLineNumber(), endLine: iface.getEndLineNumber() });
  }

  for (const ta of sourceFile.getTypeAliases()) {
    symbols.push({ name: ta.getName(), kind: "type", startLine: ta.getStartLineNumber(), endLine: ta.getEndLineNumber() });
  }

  for (const varStmt of sourceFile.getVariableStatements()) {
    for (const decl of varStmt.getDeclarations()) {
      const init = decl.getInitializer();
      if (!init) continue;
      if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) {
        const name = decl.getName();
        let kind: SymbolKind = "function";
        if (isCustomHook(name)) kind = "hook";
        else if (isReactComponent(decl)) kind = "component";
        symbols.push({ name, kind, startLine: varStmt.getStartLineNumber(), endLine: varStmt.getEndLineNumber() });
      }
    }
  }

  // relations
  const localNames = new Set(symbols.map((s) => s.name));
  const matchNames = globalSymbolNames
    ? new Set([...localNames, ...globalSymbolNames])
    : localNames;
  const relations: ExtractedRelation[] = [];
  const seenRel = new Set<string>();

  function addRelation(from: string, to: string, kind: ExtractedRelation["kind"]) {
    const key = `${from}:${to}:${kind}`;
    if (seenRel.has(key)) return;
    seenRel.add(key);
    relations.push({ from, to, kind });
  }

  function findContainingSymbol(line: number): string | undefined {
    for (const sym of symbols) {
      if (line >= sym.startLine && line <= sym.endLine) return sym.name;
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
      if (matchNames.has(name) && name !== caller) {
        addRelation(caller, name, isCustomHook(name) ? "hook-use" : "call");
      }
    } else if (Node.isPropertyAccessExpression(expr)) {
      const methodName = expr.getName();
      if (matchNames.has(methodName) && methodName !== caller) {
        addRelation(caller, methodName, "method-call");
      }
    }
  }

  for (const jsx of sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    const tagName = jsx.getTagNameNode().getText();
    if (matchNames.has(tagName)) {
      const line = jsx.getStartLineNumber();
      const caller = findContainingSymbol(line);
      if (caller && caller !== tagName) addRelation(caller, tagName, "component-use");
    }
  }

  for (const jsx of sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    const tagName = jsx.getTagNameNode().getText();
    if (matchNames.has(tagName)) {
      const line = jsx.getStartLineNumber();
      const caller = findContainingSymbol(line);
      if (caller && caller !== tagName) addRelation(caller, tagName, "component-use");
    }
  }

  // HTTP
  const httpCalls: HttpCall[] = [];
  const httpRoutes: HttpRoute[] = [];

  const routePath = inferRoutePathFromFilePath(filePath);
  if (routePath) {
    for (const fn of sourceFile.getFunctions()) {
      const name = fn.getName();
      if (name && fn.isExported() && APP_ROUTER_METHODS.has(name)) {
        const displayName = `${name} ${routePath}`;
        const idx = symbols.findIndex((s) => s.name === name);
        if (idx !== -1) symbols[idx].name = displayName;
        httpRoutes.push({ handler: displayName, method: name, path: routePath, file: filePath });
      }
    }
    for (const stmt of sourceFile.getVariableStatements()) {
      if (!stmt.isExported()) continue;
      for (const decl of stmt.getDeclarations()) {
        const name = decl.getName();
        if (APP_ROUTER_METHODS.has(name)) {
          const displayName = `${name} ${routePath}`;
          const idx = symbols.findIndex((s) => s.name === name);
          if (idx !== -1) symbols[idx].name = displayName;
          httpRoutes.push({ handler: displayName, method: name, path: routePath, file: filePath });
        }
      }
    }
  }

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    const args = call.getArguments();
    if (args.length === 0) continue;
    const urlPath = extractUrlPath(args[0]);
    if (!urlPath) continue;
    const line = call.getStartLineNumber();

    if (Node.isIdentifier(expr)) {
      const caller = findContainingSymbol(line);
      if (caller) httpCalls.push({ caller, path: urlPath, file: filePath });
    } else if (Node.isPropertyAccessExpression(expr)) {
      const methodName = expr.getName().toLowerCase();
      if (HTTP_METHODS.has(methodName)) {
        const handlerArg = args[args.length - 1];
        const hasHandlerArg = args.length >= 2 && (
          Node.isIdentifier(handlerArg) || Node.isArrowFunction(handlerArg) || Node.isFunctionExpression(handlerArg)
        );
        if (hasHandlerArg) {
          let handlerName: string | undefined;
          if (Node.isIdentifier(handlerArg)) handlerName = handlerArg.getText();
          if (handlerName) httpRoutes.push({ handler: handlerName, method: methodName.toUpperCase(), path: urlPath, file: filePath });
          else {
            const caller = findContainingSymbol(line);
            if (caller) httpRoutes.push({ handler: caller, method: methodName.toUpperCase(), path: urlPath, file: filePath });
          }
        } else {
          const caller = findContainingSymbol(line);
          if (caller) httpCalls.push({ caller, method: methodName.toUpperCase(), path: urlPath, file: filePath });
        }
      } else {
        const caller = findContainingSymbol(line);
        if (caller) httpCalls.push({ caller, path: urlPath, file: filePath });
      }
    }
  }

  // server action exports
  const serverActionExports: string[] = [];
  const text = sourceFile.getFullText();
  if (text.includes('"use server"') || text.includes("'use server'")) {
    for (const fn of sourceFile.getFunctions()) {
      const name = fn.getName();
      if (name && fn.isExported()) serverActionExports.push(name);
    }
    for (const stmt of sourceFile.getVariableStatements()) {
      if (!stmt.isExported()) continue;
      for (const decl of stmt.getDeclarations()) {
        const init = decl.getInitializer();
        if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
          serverActionExports.push(decl.getName());
        }
      }
    }
  }

  return { symbols, relations, httpCalls, httpRoutes, serverActionExports };
}
