import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { ensureRepo, checkoutSha } from "./repo-cache";
import { parseOpenApi, type ApiSpec } from "./openapi";

const execFileAsync = promisify(execFile);

// 中身を判定するために読む先頭のバイト数
const HEAD_BYTES = 4096;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type OpenApiScope = "changed" | "all";

export type SpecSource = { path: string; content: string; changed: boolean };

export type SpecFile = { path: string; changed: boolean; spec: ApiSpec };

export function isSpecCandidate(filePath: string): boolean {
  return /\.(ya?ml|json)$/i.test(filePath);
}

export function looksLikeOpenApi(head: string): boolean {
  return /^["']?(openapi|swagger)["']?\s*:/m.test(head) || /"(openapi|swagger)"\s*:/.test(head);
}

export function collectSpecs(sources: SpecSource[]): SpecFile[] {
  return sources
    .flatMap(({ path, content, changed }) => {
      const spec = parseOpenApi(content);
      return spec ? [{ path, changed, spec }] : [];
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

export async function loadOpenApiSpecs(repo: string, number: number, scope: OpenApiScope): Promise<SpecFile[]> {
  const { stdout } = await execFileAsync("gh", [
    "pr", "view", String(number), "--repo", repo,
    "--json", "headRefOid,files",
  ]);
  const { headRefOid: sha, files } = JSON.parse(stdout) as { headRefOid: string; files: { path: string }[] };
  const changedPaths = new Set(files.map((f) => f.path));

  const repoDir = await ensureRepo(repo);
  await checkoutSha(repoDir, sha);

  const targets = scope === "changed" ? [...changedPaths] : await listTrackedFiles(repoDir);
  const sources: SpecSource[] = [];
  for (const rel of targets.filter(isSpecCandidate)) {
    const content = readSpecLike(path.join(repoDir, rel));
    if (content !== null) sources.push({ path: rel, content, changed: changedPaths.has(rel) });
  }
  return collectSpecs(sources);
}

async function listTrackedFiles(repoDir: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["ls-files"], {
    cwd: repoDir,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.split("\n").filter(Boolean);
}

// 削除済み・大きすぎる・先頭に openapi/swagger キーが無いファイルは null
function readSpecLike(absPath: string): string | null {
  let fd: number | undefined;
  try {
    const stat = fs.statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    fd = fs.openSync(absPath, "r");
    const buf = Buffer.alloc(Math.min(HEAD_BYTES, stat.size));
    fs.readSync(fd, buf, 0, buf.length, 0);
    if (!looksLikeOpenApi(buf.toString("utf8"))) return null;
    return fs.readFileSync(absPath, "utf8");
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
