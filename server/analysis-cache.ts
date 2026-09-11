import fs from "node:fs";
import path from "node:path";
import type { AstAnalysisResult } from "./ast-types";

const CACHE_ROOT = path.resolve(process.cwd(), ".cache/analysis");

function cacheFile(owner: string, repo: string, sha: string): string {
  return path.join(CACHE_ROOT, owner, repo, `${sha}.json`);
}

export function getAnalysisCache(fullRepo: string, sha: string): AstAnalysisResult | null {
  const [owner, repo] = fullRepo.split("/");
  const file = cacheFile(owner, repo, sha);
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (!data || !Array.isArray(data.symbols) || !Array.isArray(data.relations)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function setAnalysisCache(fullRepo: string, sha: string, result: AstAnalysisResult): void {
  const [owner, repo] = fullRepo.split("/");
  const file = cacheFile(owner, repo, sha);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
}
