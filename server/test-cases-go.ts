import fs from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";

export type GoTestKind = "test" | "benchmark" | "fuzz";

export type GoTestCase = {
  kind: GoTestKind;
  names: string[];
  line: number;
  dynamic: boolean;
};

export type GoTestFile = { path: string; cases: GoTestCase[] };

const TOOLS_DIR = path.resolve(import.meta.dirname, "tools");
const BINARY_PATH = path.join(TOOLS_DIR, "gotests-bin");

let binaryBuilt = false;

// TODO: godoc.ts と同じ build・実行の処理。共通化する
function ensureBinary(): string {
  if (binaryBuilt && fs.existsSync(BINARY_PATH)) return BINARY_PATH;
  execFileSync("go", ["build", "-o", BINARY_PATH, "./gotests"], { cwd: TOOLS_DIR, timeout: 60000 });
  binaryBuilt = true;
  return BINARY_PATH;
}

export function extractGoTestCases(files: { path: string; content: string }[]): Promise<GoTestFile[]> {
  if (files.length === 0) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const child = spawn(ensureBinary(), [], { timeout: 60000 });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr || `gotests exited with ${code}`));
      try {
        resolve(JSON.parse(stdout) as GoTestFile[]);
      } catch (e) {
        reject(e);
      }
    });
    child.stdin.end(JSON.stringify(files));
  });
}
