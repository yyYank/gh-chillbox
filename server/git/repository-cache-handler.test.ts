import { describe, it, expect, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensureWorktree } from "./repository-cache-handler";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function commit(repoDir: string, content: string): string {
  writeFileSync(path.join(repoDir, "file.txt"), content);
  git(repoDir, "add", "file.txt");
  git(repoDir, "-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", content);
  return git(repoDir, "rev-parse", "HEAD");
}

describe("ensureWorktree", () => {
  let repoDir: string;
  let sha1: string;
  let sha2: string;

  beforeEach(() => {
    repoDir = path.join(mkdtempSync(path.join(tmpdir(), "worktree-")), "repo");
    execFileSync("git", ["init", "--quiet", repoDir]);
    sha1 = commit(repoDir, "v1");
    sha2 = commit(repoDir, "v2");
  });

  it("PR 番号ごとに指定した sha の作業ディレクトリを作る", async () => {
    const dir = await ensureWorktree(repoDir, 1, sha1);
    expect(readFileSync(path.join(dir, "file.txt"), "utf8")).toBe("v1");
  });

  it("同じ PR で sha が変わったら同じ作業ディレクトリを新しい sha に切り替える", async () => {
    const first = await ensureWorktree(repoDir, 1, sha1);
    const second = await ensureWorktree(repoDir, 1, sha2);
    expect(second).toBe(first);
    expect(readFileSync(path.join(second, "file.txt"), "utf8")).toBe("v2");
  });

  it("別の PR を並列に用意しても互いの sha を上書きしない", async () => {
    const [dir1, dir2] = await Promise.all([ensureWorktree(repoDir, 1, sha1), ensureWorktree(repoDir, 2, sha2)]);
    expect(dir1).not.toBe(dir2);
    expect(readFileSync(path.join(dir1, "file.txt"), "utf8")).toBe("v1");
    expect(readFileSync(path.join(dir2, "file.txt"), "utf8")).toBe("v2");
  });
});
