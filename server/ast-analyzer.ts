import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseDiffToChangedLines } from "./diff-parser";
import { extractSymbolsFromFile as extractTsSymbols, extractRelationsFromFile as extractTsRelations } from "./ast-ts";
import { extractSymbolsFromGoFile } from "./ast-go";
import { ensureRepo, checkoutSha } from "./repo-cache";
import { getAnalysisCache, setAnalysisCache } from "./analysis-cache";
import type { ChangedSymbol, SymbolRelation, AstAnalysisResult } from "./ast-types";

const execFileAsync = promisify(execFile);

const TS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const GO_EXTENSIONS = new Set([".go"]);

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

export async function analyzepr(
  repo: string,
  prNumber: number,
): Promise<AstAnalysisResult> {
  const { stdout: prJson } = await execFileAsync("gh", [
    "pr", "view", String(prNumber), "--repo", repo,
    "--json", "headRefOid",
  ]);
  const { headRefOid: sha } = JSON.parse(prJson);

  const cached = getAnalysisCache(repo, sha);
  if (cached) return cached;

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

  for (const fc of supportedFiles) {
    const fullPath = path.join(cachedRepoDir, fc.file);

    if (isGoFile(fc.file)) {
      const { symbols: fileSymbols, relations: fileRelations } = await extractSymbolsFromGoFile(fullPath);
      for (const sym of fileSymbols) {
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
      allRelations.push(...fileRelations);
    } else if (isTsFile(fc.file)) {
      const fileSymbols = extractTsSymbols(fullPath);
      const fileRelations = extractTsRelations(fullPath);
      for (const sym of fileSymbols) {
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
      allRelations.push(...fileRelations);
    }
  }

  const changedNames = new Set(allSymbols.map((s) => s.name));
  const relevantRelations = allRelations.filter(
    (r) => changedNames.has(r.from) || changedNames.has(r.to),
  );

  const result: AstAnalysisResult = { symbols: allSymbols, relations: relevantRelations };
  setAnalysisCache(repo, sha, result);
  return result;
}
