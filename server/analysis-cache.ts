import fs from "node:fs";
import path from "node:path";
import type { AstAnalysisResult } from "./ast-types";

const CACHE_ROOT = path.resolve(process.cwd(), ".cache/analysis");
const CACHE_VERSION = 3;

type CacheEnvelope = AstAnalysisResult & { _cacheVersion?: number };

function cacheFile(owner: string, repo: string, sha: string): string {
  return path.join(CACHE_ROOT, owner, repo, `${sha}.json`);
}

export function getAnalysisCache(fullRepo: string, sha: string): AstAnalysisResult | null {
  const [owner, repo] = fullRepo.split("/");
  const file = cacheFile(owner, repo, sha);
  if (!fs.existsSync(file)) return null;
  try {
    const data: CacheEnvelope = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (!data || !Array.isArray(data.symbols) || !Array.isArray(data.relations)) {
      return null;
    }
    if ((data._cacheVersion ?? 0) < CACHE_VERSION) {
      fs.unlinkSync(file);
      return null;
    }
    return { symbols: data.symbols, relations: data.relations };
  } catch {
    return null;
  }
}

export function setAnalysisCache(fullRepo: string, sha: string, result: AstAnalysisResult): void {
  const [owner, repo] = fullRepo.split("/");
  const file = cacheFile(owner, repo, sha);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const envelope: CacheEnvelope = { ...result, _cacheVersion: CACHE_VERSION };
  fs.writeFileSync(file, JSON.stringify(envelope, null, 2));
}
