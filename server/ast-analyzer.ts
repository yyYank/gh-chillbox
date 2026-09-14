import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseDiffToChangedLines } from "./diff-parser";
import { analyzeTsFile, matchPaths, type HttpCall, type HttpRoute } from "./ast-ts";
import { batchExtractGoFiles } from "./ast-go";
import { ensureRepo, checkoutSha } from "./repo-cache";
import type { ChangedSymbol, SymbolKind, SymbolRelation, AstAnalysisResult } from "./ast-types";

const execFileAsync = promisify(execFile);

const TS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const GO_EXTENSIONS = new Set([".go"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "vendor", "dist", "build", ".next", "__pycache__"]);

function isSupported(filePath: string): boolean {
  const ext = path.extname(filePath);
  return TS_EXTENSIONS.has(ext) || GO_EXTENSIONS.has(ext);
}

function isGoFile(filePath: string): boolean {
  return GO_EXTENSIONS.has(path.extname(filePath));
}

function isTsFile(filePath: string): boolean {
  return TS_EXTENSIONS.has(path.extname(filePath));
}

export function isTestOrMockFile(filePath: string): boolean {
  return /\.test\.[jt]sx?$|\.spec\.[jt]sx?$|_test\.go$|(?:^|\/)(?:__tests__|test-fixtures|tests?)\//i.test(filePath)
    || /(?:^|\/)mock_[^/]+\.go$/.test(filePath);
}

export function detectModules(changedFiles: string[]): string[] {
  const modules = new Set<string>();
  const modulePatterns = ["apps", "packages", "cmd", "internal"];
  for (const file of changedFiles) {
    const parts = file.split("/");
    let matched = false;
    for (const prefix of modulePatterns) {
      const idx = parts.indexOf(prefix);
      if (idx !== -1 && idx + 1 < parts.length) {
        modules.add(parts.slice(0, idx + 2).join("/"));
        matched = true;
        break;
      }
    }
    if (!matched) {
      modules.add(".");
    }
  }
  return [...modules];
}

function walkDir(dir: string, extensions: Set<string>): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full, extensions));
    } else if (extensions.has(path.extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

export async function analyzepr(
  repo: string,
  prNumber: number,
): Promise<AstAnalysisResult> {
  const { stdout: prJson } = await execFileAsync("gh", [
    "pr", "view", String(prNumber), "--repo", repo,
    "--json", "headRefOid",
  ]);
  const { headRefOid: sha } = JSON.parse(prJson);

  const { stdout: diffText } = await execFileAsync("gh", [
    "pr", "diff", String(prNumber), "--repo", repo,
  ]);

  const fileChanges = parseDiffToChangedLines(diffText);
  const supportedFiles = fileChanges.filter((f) => isSupported(f.file) && !isTestOrMockFile(f.file));
  const unsupportedFiles = fileChanges.filter((f) => !isSupported(f.file) && !isTestOrMockFile(f.file));

  const allSymbols: ChangedSymbol[] = [];
  const allRelations: SymbolRelation[] = [];

  for (const fc of unsupportedFiles) {
    allSymbols.push({
      id: `${fc.file}:(file)`,
      name: fc.file.split("/").pop() || fc.file,
      kind: "unknown",
      file: fc.file,
      startLine: 0,
      endLine: 0,
      changedLines: fc.changedLines,
    });
  }

  let cachedRepoDir = "";
  if (supportedFiles.length > 0) {
    cachedRepoDir = await ensureRepo(repo);
    await checkoutSha(cachedRepoDir, sha);
  }

  const modules = detectModules(supportedFiles.map((f) => f.file));

  const allModuleGoFiles: string[] = [];
  const allModuleTsFiles: string[] = [];
  for (const mod of modules) {
    const moduleDir = mod === "." ? cachedRepoDir : path.join(cachedRepoDir, mod);
    allModuleGoFiles.push(...walkDir(moduleDir, GO_EXTENSIONS).filter((f) => !isTestOrMockFile(f)));
    allModuleTsFiles.push(...walkDir(moduleDir, TS_EXTENSIONS).filter((f) => !isTestOrMockFile(f)));
  }

  // Go: バッチPass 1 — 全Goファイルからsymbol名を収集（1プロセス）
  const goPass1Results = await batchExtractGoFiles(allModuleGoFiles);
  const globalGoSymbolNames: string[] = [];
  for (const [, result] of goPass1Results) {
    for (const sym of result.symbols) {
      globalGoSymbolNames.push(sym.name);
    }
  }

  // TS: 全モジュールファイルからsymbol名を収集（1ファイル1 Project、並列）
  const globalSymbolNames = new Set<string>(globalGoSymbolNames);
  const tsAnalysisCache = new Map<string, ReturnType<typeof analyzeTsFile>>();

  const tsPromises = allModuleTsFiles.map((tsFile) =>
    Promise.resolve().then(() => {
      try {
        const analysis = analyzeTsFile(tsFile);
        tsAnalysisCache.set(tsFile, analysis);
        for (const sym of analysis.symbols) globalSymbolNames.add(sym.name);
        for (const name of analysis.serverActionExports) globalSymbolNames.add(name);
      } catch { /* skip */ }
    })
  );
  await Promise.all(tsPromises);

  // TS: globalSymbolNamesが揃ったので、relation再取得が必要なファイルを再解析
  const tsReanalyzePromises = allModuleTsFiles.map((tsFile) =>
    Promise.resolve().then(() => {
      try {
        const analysis = analyzeTsFile(tsFile, globalSymbolNames);
        tsAnalysisCache.set(tsFile, analysis);
      } catch { /* skip */ }
    })
  );
  await Promise.all(tsReanalyzePromises);

  // Go: バッチPass 2 — 外部symbolを渡してrelation検出（1プロセス）
  const goPass2Results = await batchExtractGoFiles(allModuleGoFiles, globalGoSymbolNames);

  // 変更ファイルの分類
  const changedGoFiles: { fc: typeof supportedFiles[0]; fullPath: string }[] = [];
  const changedTsFiles: { fc: typeof supportedFiles[0]; fullPath: string }[] = [];
  for (const fc of supportedFiles) {
    const fullPath = path.join(cachedRepoDir, fc.file);
    if (isGoFile(fc.file)) changedGoFiles.push({ fc, fullPath });
    else if (isTsFile(fc.file)) changedTsFiles.push({ fc, fullPath });
  }

  // シンボル参照テーブル: bareName → [{name (修飾名), kind, file}]
  type SymInfo = { name: string; kind: SymbolKind; file: string };
  const symbolLookup = new Map<string, SymInfo[]>();

  function addToLookup(symName: string, kind: SymbolKind, file: string) {
    const dotIdx = symName.lastIndexOf(".");
    const bareName = dotIdx !== -1 ? symName.slice(dotIdx + 1) : symName;
    const info: SymInfo = { name: symName, kind, file };
    let arr = symbolLookup.get(bareName);
    if (!arr) { arr = []; symbolLookup.set(bareName, arr); }
    if (!arr.some((i) => i.name === symName && i.file === file)) arr.push(info);
    if (dotIdx !== -1) {
      let qArr = symbolLookup.get(symName);
      if (!qArr) { qArr = []; symbolLookup.set(symName, qArr); }
      if (!qArr.some((i) => i.name === symName && i.file === file)) qArr.push(info);
    }
  }

  // Go: 全ファイルからrelation/HTTPルート収集 + lookup構築
  const allHttpCalls: HttpCall[] = [];
  const allHttpRoutes: HttpRoute[] = [];

  const goHandlerRenames = new Map<string, string>();
  for (const [goFile, result] of goPass2Results) {
    const relFile = path.relative(cachedRepoDir, goFile);
    allRelations.push(...result.relations);
    for (const route of result.httpRoutes) {
      if (route.handler && route.method && route.path) {
        const displayName = `${route.method} ${route.path}`;
        goHandlerRenames.set(route.handler, displayName);
        allHttpRoutes.push({ handler: displayName, method: route.method, path: route.path, file: relFile });
      } else {
        allHttpRoutes.push({ handler: route.handler, method: route.method, path: route.path, file: relFile });
      }
    }
    for (const sym of result.symbols) {
      const displayName = goHandlerRenames.get(sym.name);
      if (displayName) {
        addToLookup(displayName, sym.kind, relFile);
      }
      addToLookup(sym.name, sym.kind, relFile);
    }
  }

  // Swagger: operationId → METHOD /path でgoHandlerRenamesを上書き（swagger優先）
  const swaggerDirs = [cachedRepoDir, path.join(cachedRepoDir, "docs")];
  const openapiDir = path.join(cachedRepoDir, "openapi");
  if (fs.existsSync(openapiDir)) {
    try {
      for (const sub of fs.readdirSync(openapiDir)) {
        const subPath = path.join(openapiDir, sub);
        if (fs.statSync(subPath).isDirectory()) swaggerDirs.push(subPath);
      }
    } catch {}
  }
  const methodNames = new Map<string, string[]>();
  for (const [, result] of goPass2Results) {
    for (const sym of result.symbols) {
      if (sym.kind === "method") {
        const dotIdx = sym.name.lastIndexOf(".");
        if (dotIdx !== -1) {
          const mn = sym.name.slice(dotIdx + 1);
          const arr = methodNames.get(mn) ?? [];
          arr.push(sym.name);
          methodNames.set(mn, arr);
        }
      }
    }
  }
  for (const dir of swaggerDirs) {
    for (const fname of ["swagger.json", "openapi.json"]) {
      const fp = path.join(dir, fname);
      if (!fs.existsSync(fp)) continue;
      try {
        const spec = JSON.parse(fs.readFileSync(fp, "utf-8"));
        for (const [pathStr, methods] of Object.entries(spec.paths ?? {})) {
          for (const [method, detail] of Object.entries(methods as Record<string, any>)) {
            if (!["get","post","put","delete","patch"].includes(method)) continue;
            const opId = detail?.operationId;
            if (!opId) continue;
            const displayName = `${method.toUpperCase()} ${pathStr}`;
            const exact = methodNames.get(opId);
            if (exact && exact.length === 1) {
              goHandlerRenames.set(exact[0], displayName);
            }
          }
        }
      } catch {}
    }
  }

  // Go: 変更ファイルのsymbol収集
  for (const { fc, fullPath } of changedGoFiles) {
    const result = goPass2Results.get(fullPath);
    if (!result) continue;
    for (const sym of result.symbols) {
      const overlapping = fc.changedLines.filter(
        (line) => line >= sym.startLine && line <= sym.endLine,
      );
      if (overlapping.length > 0) {
        const displayName = goHandlerRenames.get(sym.name) ?? sym.name;
        allSymbols.push({
          id: `${fc.file}:${displayName}`,
          name: displayName,
          kind: sym.kind,
          file: fc.file,
          startLine: sym.startLine,
          endLine: sym.endLine,
          changedLines: overlapping,
        });
      }
    }
  }

  // TS: 全ファイルのrelation/HTTP収集 + lookup構築
  for (const [tsFile, analysis] of tsAnalysisCache) {
    const relFile = path.relative(cachedRepoDir, tsFile);
    allRelations.push(...analysis.relations);
    allHttpCalls.push(...analysis.httpCalls.map((c) => ({ ...c, file: relFile })));
    allHttpRoutes.push(...analysis.httpRoutes.map((r) => ({ ...r, file: relFile })));
    for (const sym of analysis.symbols) {
      addToLookup(sym.name, sym.kind, relFile);
    }
  }

  // TS: 変更ファイルのsymbol収集
  for (const { fc, fullPath } of changedTsFiles) {
    const analysis = tsAnalysisCache.get(fullPath);
    if (!analysis) continue;
    for (const sym of analysis.symbols) {
      const overlapping = fc.changedLines.filter(
        (line) => line >= sym.startLine && line <= sym.endLine,
      );
      if (overlapping.length > 0) {
        allSymbols.push({
          id: `${fc.file}:${sym.name}`,
          name: sym.name,
          kind: sym.kind,
          file: fc.file,
          startLine: sym.startLine,
          endLine: sym.endLine,
          changedLines: overlapping,
        });
      }
    }
  }

  function deriveApp(file: string): string {
    const parts = file.split("/");
    if ((parts[0] === "apps" || parts[0] === "packages") && parts.length > 1) return parts[1];
    if (parts.length >= 2 && (parts[0] === "internal" || parts[0] === "cmd" || parts[0] === "pkg")) return parts[1];
    return parts[0] || "";
  }

  // HTTPマッチング: fetch → route（同一アプリ→relations、異なるアプリ→moduleConnections）
  const allModuleConnections: SymbolRelation[] = [];
  for (const call of allHttpCalls) {
    for (const route of allHttpRoutes) {
      if (call.caller === route.handler) continue;
      if (call.method && route.method && call.method.toUpperCase() !== route.method.toUpperCase()) continue;
      if (!matchPaths(call.path, route.path)) continue;
      const callApp = call.file ? deriveApp(call.file) : "";
      const routeApp = route.file ? deriveApp(route.file) : "";
      if (callApp && routeApp && callApp === routeApp) {
        const segments = call.path.split("/").filter(Boolean);
        if (segments.length < 2) continue;
        allRelations.push({ from: call.caller, to: route.handler, kind: "http-infer" });
      } else {
        allModuleConnections.push({ from: call.caller, to: route.handler, kind: "http-infer" });
      }
    }
  }

  // bare name → 修飾名 解決 (interface→concrete 解決を含む)
  function resolveRelations(rels: SymbolRelation[]): SymbolRelation[] {
    const directEdges = new Set(rels.map((r) => `${r.from}\t${r.to}`));
    const resolved: SymbolRelation[] = [];
    for (const rel of rels) {
      let toInfos = symbolLookup.get(rel.to);
      if (toInfos && toInfos.some((m) => m.name === rel.to)) {
        resolved.push(rel);
        continue;
      }
      if (!toInfos) {
        const dotIdx = rel.to.lastIndexOf(".");
        if (dotIdx !== -1) {
          toInfos = symbolLookup.get(rel.to.slice(dotIdx + 1));
        }
        if (!toInfos) {
          resolved.push(rel);
          continue;
        }
      }

      const fromInfos = symbolLookup.get(rel.from);
      const fromFile = fromInfos?.[0]?.file ?? "";
      const fromApp = deriveApp(fromFile);

      const fromDot = rel.from.indexOf(".");
      const fromType = fromDot !== -1 ? rel.from.slice(0, fromDot) : "";

      const sameAppInfos = fromApp ? toInfos.filter((i) => deriveApp(i.file) === fromApp) : toInfos;
      const candidates = sameAppInfos.length > 0 ? sameAppInfos : toInfos;
      if (candidates.length === 0) {
        resolved.push(rel);
        continue;
      }

      for (const info of candidates) {
        const toDot = info.name.indexOf(".");
        const toType = toDot !== -1 ? info.name.slice(0, toDot) : "";
        if (fromType && toType && fromType === toType) continue;
        if (directEdges.has(`${info.name}\t${rel.from}`)) continue;
        resolved.push({ from: rel.from, to: info.name, kind: rel.kind });
      }
    }
    return resolved;
  }

  const resolvedRelations = resolveRelations(allRelations);

  // Go: HTTPルートのハンドラ名をrelation内でも表示名に置換（resolveRelations後に実行）
  if (goHandlerRenames.size > 0) {
    for (let i = 0; i < resolvedRelations.length; i++) {
      const r = resolvedRelations[i];
      const newFrom = goHandlerRenames.get(r.from);
      const newTo = goHandlerRenames.get(r.to);
      if (newFrom || newTo) {
        resolvedRelations[i] = { from: newFrom ?? r.from, to: newTo ?? r.to, kind: r.kind };
      }
    }
  }

  // diffフィルタリング（2パス: 変更シンボル → 1ホップ拡張）
  const changedApps = new Set(allSymbols.filter((s) => s.changedLines.length > 0).map((s) => deriveApp(s.file)));

  const changedNames = new Set(allSymbols.map((s) => s.name));
  let relevantRelations = resolvedRelations.filter(
    (r) => changedNames.has(r.from) || changedNames.has(r.to),
  );

  function addContextNode(name: string): boolean {
    const infos = symbolLookup.get(name);
    const info = infos?.find((i) => i.name === name);
    const file = info?.file ?? "";
    if (!file) return false;
    if (!changedApps.has(deriveApp(file))) return false;
    if (isTestOrMockFile(file)) return false;
    allSymbols.push({
      id: `(context):${name}`,
      name,
      kind: info?.kind ?? "unknown",
      file,
      startLine: 0,
      endLine: 0,
      changedLines: [],
    });
    return true;
  }

  // 1-hop: 変更シンボルの直接の呼び出し先/元のみコンテキストノードとして追加
  const existingNames = new Set(allSymbols.map((s) => s.name));
  for (const rel of relevantRelations) {
    for (const name of [rel.from, rel.to]) {
      if (!existingNames.has(name)) {
        if (addContextNode(name)) {
          existingNames.add(name);
        }
      }
    }
  }

  const finalSymbolMap = new Map(allSymbols.map((s) => [s.name, s]));
  const seen = new Set<string>();
  const dedupedRelations: SymbolRelation[] = [];
  for (const r of relevantRelations) {
    const fromSym = finalSymbolMap.get(r.from);
    const toSym = finalSymbolMap.get(r.to);
    if (!fromSym || !toSym) continue;
    const key = `${r.from}:${r.to}:${r.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const fromApp = deriveApp(fromSym.file);
    const toApp = deriveApp(toSym.file);
    if (fromApp && toApp && fromApp !== toApp) {
      allModuleConnections.push(r);
    } else {
      dedupedRelations.push(r);
    }
  }

  return { symbols: allSymbols, relations: dedupedRelations, moduleConnections: allModuleConnections };
}
