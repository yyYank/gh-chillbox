import fs from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";

export type GoSourceFile = { name: string; content: string };

export type GoPackageInput = { dir: string; files: GoSourceFile[] };

export type GoDocKind = "const" | "var" | "type" | "func" | "method";

export type GoDocItem = {
  kind: GoDocKind;
  name: string;
  decl: string;
  docText: string;
  docHtml: string;
};

export type GoPackageDoc = {
  dir: string;
  name: string;
  docText: string;
  docHtml: string;
  items: GoDocItem[];
};

const TOOLS_DIR = path.resolve(import.meta.dirname, "../tools");
const BINARY_PATH = path.join(TOOLS_DIR, "godoc-bin");

let binaryBuilt = false;

function ensureBinary(): string {
  if (binaryBuilt && fs.existsSync(BINARY_PATH)) return BINARY_PATH;
  execFileSync("go", ["build", "-o", BINARY_PATH, "./godoc"], { cwd: TOOLS_DIR, timeout: 60000 });
  binaryBuilt = true;
  return BINARY_PATH;
}

export function extractGoDocs(packages: GoPackageInput[]): Promise<GoPackageDoc[]> {
  if (packages.length === 0) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const child = spawn(ensureBinary(), [], { timeout: 60000 });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr || `godoc exited with ${code}`));
      try {
        resolve(JSON.parse(stdout) as GoPackageDoc[]);
      } catch (e) {
        reject(e);
      }
    });
    child.stdin.end(JSON.stringify(packages));
  });
}
