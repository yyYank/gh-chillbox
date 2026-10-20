import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { createInFlight } from "./in-flight";

const execFileAsync = promisify(execFile);
const fetchInFlight = createInFlight<string>();

const CACHE_ROOT = path.resolve(process.cwd(), ".cache/repos");

function repoDir(owner: string, repo: string): string {
  return path.join(CACHE_ROOT, owner, repo);
}

// 並列に呼ばれても同じ repo の clone/fetch は1回にまとめ、git のロックの取り合いを防ぐ
export function ensureRepo(fullRepo: string): Promise<string> {
  return fetchInFlight(fullRepo, () => cloneOrFetch(fullRepo));
}

async function cloneOrFetch(fullRepo: string): Promise<string> {
  const [owner, repo] = fullRepo.split("/");
  const dir = repoDir(owner, repo);

  if (fs.existsSync(path.join(dir, ".git"))) {
    await execFileAsync("git", ["fetch", "--quiet"], { cwd: dir, timeout: 60000 });
  } else {
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
