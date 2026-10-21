import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { createInFlight } from "./in-flight";

const execFileAsync = promisify(execFile);
const cloneInFlight = createInFlight<string>();

const CACHE_ROOT = path.resolve(process.cwd(), ".cache/repos");

function repoDir(owner: string, repo: string): string {
  return path.join(CACHE_ROOT, owner, repo);
}

// clone が無ければ作り、呼び出し側が使うコミットだけを取ってくる
export async function ensureRepo(fullRepo: string, shas: string[]): Promise<string> {
  // 並列に呼ばれても同じ repo の clone は1回にまとめる
  const dir = await cloneInFlight(fullRepo, () => cloneIfMissing(fullRepo));
  await fetchCommits(dir, shas);
  return dir;
}

async function cloneIfMissing(fullRepo: string): Promise<string> {
  const [owner, repo] = fullRepo.split("/");
  const dir = repoDir(owner, repo);

  if (!fs.existsSync(path.join(dir, ".git"))) {
    fs.mkdirSync(path.join(CACHE_ROOT, owner), { recursive: true });
    await execFileAsync("git", ["clone", "--filter=blob:none", "--quiet", `git@github.com:${fullRepo}.git`, dir], {
      timeout: 120000,
    });
  }

  return dir;
}

export async function checkoutSha(repoDir: string, sha: string): Promise<void> {
  await execFileAsync("git", ["checkout", "--quiet", sha], {
    cwd: repoDir,
    timeout: 30000,
  });
}

async function hasCommit(repoDir: string, sha: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: repoDir });
    return true;
  } catch {
    return false;
  }
}

// 必要なコミットだけを取ってくる。ブランチ名（refs）は更新しないので、
// PR と関係ないブランチの消去・作り直しで名前がぶつかっても失敗しない
export async function fetchCommits(repoDir: string, shas: string[]): Promise<void> {
  const missing: string[] = [];
  for (const sha of new Set(shas)) {
    if (!(await hasCommit(repoDir, sha))) {
      missing.push(sha);
    }
  }
  if (missing.length === 0) {
    return;
  }
  await execFileAsync(
    "git",
    ["fetch", "--quiet", "--no-tags", "--no-write-fetch-head", "--no-auto-maintenance", "origin", ...missing],
    { cwd: repoDir, timeout: 60000 },
  );
}

// PR ごとに作業ディレクトリを分け、並列実行でも互いの checkout を上書きしない
export async function ensureWorktree(repoDir: string, prNumber: number, sha: string): Promise<string> {
  const dir = path.join(`${repoDir}.worktrees`, String(prNumber));

  if (fs.existsSync(dir)) {
    await checkoutSha(dir, sha);
  } else {
    await execFileAsync("git", ["worktree", "add", "--quiet", "--detach", dir, sha], {
      cwd: repoDir,
      timeout: 60000,
    });
  }

  return dir;
}

export async function gitOutput(repoDir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoDir,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}
