import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseDiffToChangedLines } from "./diff-parser";
import { analyzeTsFile, matchPaths, type HttpCall, type HttpRoute } from "./ast-ts";
import { batchExtractGoFiles } from "./ast-go";
import { ensureRepo, checkoutSha } from "./repo-cache";
import type { ChangedSymbol, SymbolRelation, GoHttpRoute, AstAnalysisResult } from "./ast-types";

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
  const supportedFiles = fileChanges.filter((f) => isSupported(f.file));
  const unsupportedFiles = fileChanges.filter((f) => !isSupported(f.file));

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
    allModuleGoFiles.push(...walkDir(moduleDir, GO_EXTENSIONS));
    allModuleTsFiles.push(...walkDir(moduleDir, TS_EXTENSIONS));
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

  // Go: 変更ファイルのsymbol収集 + 全ファイルのrelation/HTTPルート収集
  const allGoHttpRoutes: GoHttpRoute[] = [];
  for (const [, result] of goPass2Results) {
    allRelations.push(...result.relations);
    allGoHttpRoutes.push(...result.httpRoutes);
  }

  for (const { fc, fullPath } of changedGoFiles) {
    const result = goPass2Results.get(fullPath);
    if (!result) continue;
    for (const sym of result.symbols) {
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

  // TS: 変更ファイルのsymbol収集 + 全ファイルのrelation/HTTP収集
  const allHttpCalls: HttpCall[] = [];
  const allHttpRoutes: HttpRoute[] = [];

  for (const [, analysis] of tsAnalysisCache) {
    allRelations.push(...analysis.relations);
    allHttpCalls.push(...analysis.httpCalls);
    allHttpRoutes.push(...analysis.httpRoutes);
  }

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

  // Go HTTPルートもマッチング対象に統合
  for (const goRoute of allGoHttpRoutes) {
    allHttpRoutes.push({ handler: goRoute.handler, path: goRoute.path, file: "" });
  }

  for (const call of allHttpCalls) {
    for (const route of allHttpRoutes) {
      if (call.caller !== route.handler && matchPaths(call.path, route.path)) {
        allRelations.push({ from: call.caller, to: route.handler, kind: "http-infer" });
      }
    }
  }

  // diffフィルタリング
  const changedNames = new Set(allSymbols.map((s) => s.name));
  const relevantRelations = allRelations.filter(
    (r) => changedNames.has(r.from) || changedNames.has(r.to),
  );

  // context node
  const existingNames = new Set(allSymbols.map((s) => s.name));
  for (const rel of relevantRelations) {
    for (const name of [rel.from, rel.to]) {
      if (!existingNames.has(name)) {
        allSymbols.push({
          id: `(context):${name}`,
          name,
          kind: "unknown",
          file: "",
          startLine: 0,
          endLine: 0,
          changedLines: [],
        });
        existingNames.add(name);
      }
    }
  }

  const seen = new Set<string>();
  const dedupedRelations = relevantRelations.filter((r) => {
    const key = `${r.from}:${r.to}:${r.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { symbols: allSymbols, relations: dedupedRelations };
}
