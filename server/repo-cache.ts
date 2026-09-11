import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);

const CACHE_ROOT = path.resolve(process.cwd(), ".cache/repos");

function repoDir(owner: string, repo: string): string {
  return path.join(CACHE_ROOT, owner, repo);
}

export async function ensureRepo(fullRepo: string): Promise<string> {
  const [owner, repo] = fullRepo.split("/");
  const dir = repoDir(owner, repo);

  if (fs.existsSync(path.join(dir, ".git"))) {
    await execFileAsync("git", ["fetch", "--quiet"], { cwd: dir, timeout: 60000 });
  } else {
    fs.mkdirSync(path.join(CACHE_ROOT, owner), { recursive: true });
    await execFileAsync("git", [
      "clone",
      "--filter=blob:none",
      "--quiet",
      `https://github.com/${fullRepo}.git`,
      dir,
    ], { timeout: 120000 });
  }

  return dir;
}

export async function checkoutSha(repoDir: string, sha: string): Promise<void> {
  await execFileAsync("git", ["checkout", "--quiet", sha], {
    cwd: repoDir,
    timeout: 30000,
  });
}
