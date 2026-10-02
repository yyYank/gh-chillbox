import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { ensureRepo, checkoutSha, gitOutput } from "../git/repository-cache-handler";
import { parseOpenApi, type ApiSpec } from "./openapi";
import { diffEndpoints, markUnchanged, type DiffedEndpoint } from "./openapi-diff";

const execFileAsync = promisify(execFile);

// 中身を判定するために読む先頭のバイト数
const HEAD_BYTES = 4096;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type OpenApiScope = "changed" | "all";

// content は head の中身、baseContent は merge-base の中身。どちらも存在しなければ null
export type SpecSource = { path: string; content: string | null; baseContent?: string | null; changed: boolean };

export type SpecFile = {
  path: string;
  changed: boolean;
  spec: Omit<ApiSpec, "endpoints"> & { endpoints: DiffedEndpoint[] };
};

export function isSpecCandidate(filePath: string): boolean {
  return /\.(ya?ml|json)$/i.test(filePath);
}

export function looksLikeOpenApi(head: string): boolean {
  return /^["']?(openapi|swagger)["']?\s*:/m.test(head) || /"(openapi|swagger)"\s*:/.test(head);
}

export function collectSpecs(sources: SpecSource[]): SpecFile[] {
  return sources
    .flatMap((source) => {
      const file = toSpecFile(source);
      return file ? [file] : [];
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function toSpecFile({ path, content, baseContent, changed }: SpecSource): SpecFile | null {
  const head = content !== null ? parseOpenApi(content) : null;
  if (!changed) {
    return head && { path, changed, spec: { ...head, endpoints: markUnchanged(head.endpoints) } };
  }
  const base = baseContent ? parseOpenApi(baseContent) : null;
  const meta = head ?? base;
  if (!meta) { return null; }
  const endpoints = diffEndpoints(base?.endpoints ?? [], head?.endpoints ?? []);
  return { path, changed, spec: { version: meta.version, title: meta.title, endpoints } };
}

export async function loadOpenApiSpecs(repo: string, number: number, scope: OpenApiScope): Promise<SpecFile[]> {
  const { stdout } = await execFileAsync("gh", [
    "pr", "view", String(number), "--repo", repo,
    "--json", "headRefOid,baseRefOid,files",
  ]);
  const { headRefOid: sha, baseRefOid, files } = JSON.parse(stdout) as {
    headRefOid: string;
    baseRefOid: string;
    files: { path: string }[];
  };
  const changedPaths = new Set(files.map((f) => f.path));

  const repoDir = await ensureRepo(repo);
  await checkoutSha(repoDir, sha);
  const mergeBase = (await gitOutput(repoDir, ["merge-base", baseRefOid, sha])).trim();

  // 削除されたファイルは head に無いため、PR のファイル一覧も対象に含める
  const targets = scope === "changed"
    ? [...changedPaths]
    : [...new Set([...(await listTrackedFiles(repoDir)), ...changedPaths])];
  const sources: SpecSource[] = [];
  for (const rel of targets.filter(isSpecCandidate)) {
    const changed = changedPaths.has(rel);
    const content = readSpecLike(path.join(repoDir, rel));
    const baseContent = changed ? await readBaseSpecLike(repoDir, mergeBase, rel) : null;
    if (content !== null || baseContent !== null) { sources.push({ path: rel, content, baseContent, changed }); }
  }
  return collectSpecs(sources);
}

async function readBaseSpecLike(repoDir: string, sha: string, rel: string): Promise<string | null> {
  try {
    const content = await gitOutput(repoDir, ["show", `${sha}:${rel}`]);
    if (content.length > MAX_FILE_BYTES || !looksLikeOpenApi(content.slice(0, HEAD_BYTES))) { return null; }
    return content;
  } catch {
    return null;
  }
}

async function listTrackedFiles(repoDir: string): Promise<string[]> {
  const stdout = await gitOutput(repoDir, ["ls-files"]);
  return stdout.split("\n").filter(Boolean);
}

// 削除済み・大きすぎる・先頭に openapi/swagger キーが無いファイルは null
function readSpecLike(absPath: string): string | null {
  let fd: number | undefined;
  try {
    const stat = fs.statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) { return null; }
    fd = fs.openSync(absPath, "r");
    const buf = Buffer.alloc(Math.min(HEAD_BYTES, stat.size));
    fs.readSync(fd, buf, 0, buf.length, 0);
    if (!looksLikeOpenApi(buf.toString("utf8"))) { return null; }
    return fs.readFileSync(absPath, "utf8");
  } catch {
    return null;
  } finally {
    if (fd !== undefined) { fs.closeSync(fd); }
  }
}
