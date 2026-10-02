import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { ensureRepo, checkoutSha, gitOutput } from "../git/repository-cache-handler";
import { extractGoTestCases } from "./test-cases-go";
import { extractTsTestCases } from "./test-cases-ts";
import { extractGherkinCases } from "./test-cases-gherkin";
import { fromGo, fromTs, fromGherkin, diffTestCases, type DiffedTestCase, type TestFile } from "./test-cases-diff";

const execFileAsync = promisify(execFile);

export type TestCaseScope = "changed" | "all";

export type TestFileKind = "go" | "ts" | "gherkin";

export type DiffedTestFile = Omit<TestFile, "cases"> & { changed: boolean; cases: DiffedTestCase[] };

type Source = { path: string; content: string };

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function testFileKind(filePath: string): TestFileKind | null {
  if (filePath.endsWith("_test.go")) {
    return "go";
  }
  if (filePath.endsWith(".feature")) {
    return "gherkin";
  }
  if (!/\.[cm]?[jt]sx?$/.test(filePath)) {
    return null;
  }
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(filePath) || /(^|\/)__tests__\//.test(filePath)) {
    return "ts";
  }
  return null;
}

export async function extractTestFiles(sources: Source[]): Promise<TestFile[]> {
  const byKind = (kind: TestFileKind) => sources.filter((s) => testFileKind(s.path) === kind);
  const [go, ts, gherkin] = [byKind("go"), byKind("ts"), byKind("gherkin")];
  const files = [
    ...(await extractGoTestCases(go)).map(fromGo),
    ...extractTsTestCases(ts).map(fromTs),
    ...extractGherkinCases(gherkin).map(fromGherkin),
  ];
  // mergeTestFiles と同じくコード単位で並べる（localeCompare は記号を無視するため順序が揃わない）
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// 変更されたファイルは base と比べる。PR で削除されたファイルは base の内容を removed として返す
export function mergeTestFiles(base: TestFile[], head: TestFile[], changedPaths: Set<string>): DiffedTestFile[] {
  const baseByPath = new Map(base.map((f) => [f.path, f]));
  const headByPath = new Map(head.map((f) => [f.path, f]));
  const paths = [
    ...new Set([...head.map((f) => f.path), ...base.filter((f) => changedPaths.has(f.path)).map((f) => f.path)]),
  ];

  return paths.sort().map((p) => {
    const after = headByPath.get(p);
    const changed = changedPaths.has(p);
    const before = changed ? baseByPath.get(p) : after;
    const meta = after ?? before;
    if (!meta) {
      throw new Error(`test file not found: ${p}`);
    }
    return {
      path: p,
      framework: meta.framework,
      category: meta.category,
      changed,
      cases: diffTestCases(before?.cases ?? [], after?.cases ?? []),
    };
  });
}

export async function loadTestCases(repo: string, number: number, scope: TestCaseScope): Promise<DiffedTestFile[]> {
  const { stdout } = await execFileAsync("gh", [
    "pr",
    "view",
    String(number),
    "--repo",
    repo,
    "--json",
    "headRefOid,baseRefOid,files",
  ]);
  const {
    headRefOid: sha,
    baseRefOid,
    files,
  } = JSON.parse(stdout) as {
    headRefOid: string;
    baseRefOid: string;
    files: { path: string }[];
  };

  const repoDir = await ensureRepo(repo);
  await checkoutSha(repoDir, sha);
  const mergeBase = (await gitOutput(repoDir, ["merge-base", baseRefOid, sha])).trim();

  const changedPaths = files.map((f) => f.path).filter((p) => testFileKind(p) !== null);
  const targets =
    scope === "changed"
      ? changedPaths
      : (await gitOutput(repoDir, ["ls-files"])).split("\n").filter((p) => testFileKind(p) !== null);

  const headSources = targets.flatMap((p) => {
    const content = readHead(path.join(repoDir, p));
    return content === null ? [] : [{ path: p, content }];
  });
  const baseSources = (
    await Promise.all(
      changedPaths.map(async (p) => {
        const content = await gitOutput(repoDir, ["show", `${mergeBase}:${p}`]).catch(() => null);
        return content === null || content.length > MAX_FILE_BYTES ? [] : [{ path: p, content }];
      }),
    )
  ).flat();

  const [head, base] = await Promise.all([extractTestFiles(headSources), extractTestFiles(baseSources)]);
  return mergeTestFiles(base, head, new Set(changedPaths));
}

function readHead(absPath: string): string | null {
  try {
    const stat = fs.statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
      return null;
    }
    return fs.readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}
