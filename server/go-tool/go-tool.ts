import fs from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";

const TOOLS_DIR = path.resolve(import.meta.dirname, "../tools");

const builtTools = new Set<string>();

// server/tools/<name> の Go ツールを <name>-bin に build する。build はツールごとにプロセスで1度だけ
function ensureBinary(name: string): string {
  const binaryPath = path.join(TOOLS_DIR, `${name}-bin`);
  if (builtTools.has(name) && fs.existsSync(binaryPath)) {
    return binaryPath;
  }
  execFileSync("go", ["build", "-o", binaryPath, `./${name}`], { cwd: TOOLS_DIR, timeout: 60000 });
  builtTools.add(name);
  return binaryPath;
}

// 入力を JSON で stdin に渡し、stdout の JSON を結果として返す
export function runGoTool<T>(name: string, input: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(ensureBinary(name), [], { timeout: 60000 });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(stderr || `${name} exited with ${code}`));
      }
      try {
        resolve(JSON.parse(stdout) as T);
      } catch (e) {
        reject(e);
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}
