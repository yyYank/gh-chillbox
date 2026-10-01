import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { ensureRepo, checkoutSha } from "../git/repository-cache-handler";
import { extractGoDocs, type GoPackageDoc, type GoPackageInput } from "./godoc";
import { diffGoDocItems, type DiffedGoDocItem, type SymbolChange } from "./godoc-diff";

const execFileAsync = promisify(execFile);

export type GoDocScope = "changed" | "all";

export type DiffedGoPackage = Omit<GoPackageDoc, "items"> & {
  change: SymbolChange;
  items: DiffedGoDocItem[];
};

const EXCLUDED_DIR = /(^|\/)(vendor|testdata)(\/|$)/;

function isGoSource(file: string): boolean {
  return file.endsWith(".go") && !file.endsWith("_test.go");
}

export function goPackageDirs(paths: string[]): string[] {
  const dirs = paths
    .filter((p) => isGoSource(p) && !EXCLUDED_DIR.test(p))
    .map((p) => path.posix.dirname(p));
  return [...new Set(dirs)].sort();
}

// dir+パッケージ名で突き合わせ、パッケージ内はシンボル単位で比べる
export function pairPackages(base: GoPackageDoc[], head: GoPackageDoc[]): DiffedGoPackage[] {
  const key = (p: GoPackageDoc) => `${p.dir}\u0000${p.name}`;
  const baseByKey = new Map(base.map((p) => [key(p), p]));
  const headKeys = new Set(head.map(key));

  const current = head.map((p): DiffedGoPackage => {
    const before = baseByKey.get(key(p));
    const items = diffGoDocItems(before?.items ?? [], p.items);
    if (!before) return { ...p, change: "added", items };
    const changed = before.docText !== p.docText || items.some((i) => i.change !== "unchanged");
    return { ...p, change: changed ? "modified" : "unchanged", items };
  });
  const removed = base
    .filter((p) => !headKeys.has(key(p)))
    .map((p): DiffedGoPackage => ({ ...p, change: "removed", items: diffGoDocItems(p.items, []) }));

  return [...current, ...removed].sort((a, b) => a.dir.localeCompare(b.dir) || a.name.localeCompare(b.name));
}

export async function loadGoDocs(repo: string, number: number, scope: GoDocScope): Promise<DiffedGoPackage[]> {
  const { stdout } = await execFileAsync("gh", [
    "pr", "view", String(number), "--repo", repo,
    "--json", "headRefOid,baseRefOid,files",
  ]);
  const { headRefOid: sha, baseRefOid, files } = JSON.parse(stdout) as {
    headRefOid: string;
    baseRefOid: string;
    files: { path: string }[];
  };

  const repoDir = await ensureRepo(repo);
  await checkoutSha(repoDir, sha);
  const mergeBase = (await gitOutput(repoDir, ["merge-base", baseRefOid, sha])).trim();

  const changedDirs = goPackageDirs(files.map((f) => f.path));
  const targetDirs = scope === "changed"
    ? changedDirs
    : [...new Set([...goPackageDirs(await listTrackedFiles(repoDir)), ...changedDirs])];

  const head = await extractGoDocs(targetDirs.map((dir) => readHeadPackage(repoDir, dir)));
  const base = await extractGoDocs(
    await Promise.all(changedDirs.map((dir) => readBasePackage(repoDir, mergeBase, dir))),
  );
  // 変更の無いパッケージは head をそのまま base として扱い、すべて unchanged にする
  const changedDirSet = new Set(changedDirs);
  const unchangedHead = head.filter((p) => !changedDirSet.has(p.dir));
  return pairPackages([...base, ...unchangedHead], head);
}

function readHeadPackage(repoDir: string, dir: string): GoPackageInput {
  const abs = path.join(repoDir, dir);
  const names = fs.existsSync(abs) ? fs.readdirSync(abs).filter(isGoSource) : [];
  return {
    dir,
    files: names.map((name) => ({ name, content: fs.readFileSync(path.join(abs, name), "utf8") })),
  };
}

async function readBasePackage(repoDir: string, sha: string, dir: string): Promise<GoPackageInput> {
  const listed = await gitOutput(repoDir, ["ls-tree", "--name-only", sha, dir === "." ? "./" : `${dir}/`])
    .catch(() => "");
  const names = listed.split("\n").filter(Boolean).map((p) => path.posix.basename(p)).filter(isGoSource);
  const files = await Promise.all(names.map(async (name) => ({
    name,
    content: await gitOutput(repoDir, ["show", `${sha}:${dir === "." ? name : `${dir}/${name}`}`]).catch(() => ""),
  })));
  return { dir, files };
}

async function listTrackedFiles(repoDir: string): Promise<string[]> {
  return (await gitOutput(repoDir, ["ls-files"])).split("\n").filter(Boolean);
}

// TODO: openapi-collect.ts と同じ実装。repo-cache.ts などに共通化する
async function gitOutput(repoDir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoDir,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}
