import fs from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import type { SymbolKind, SymbolRelation, GoHttpRoute } from "./ast-types";

export type ExtractedSymbol = {
  name: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
};

export type GoParseResult = {
  symbols: ExtractedSymbol[];
  relations: SymbolRelation[];
  httpRoutes: GoHttpRoute[];
};

const TOOLS_DIR = path.resolve(import.meta.dirname, "tools");
const BINARY_PATH = path.join(TOOLS_DIR, "ast-go-parser-bin");

let binaryBuilt = false;

function ensureBinary(): string {
  if (binaryBuilt && fs.existsSync(BINARY_PATH)) return BINARY_PATH;
  execFileSync("go", ["build", "-o", BINARY_PATH, "."], { cwd: TOOLS_DIR, timeout: 30000 });
  binaryBuilt = true;
  return BINARY_PATH;
}

type RawFileResult = {
  symbols: Array<{ name: string; kind: string; startLine: number; endLine: number }>;
  relations: Array<{ from: string; to: string; kind: string }>;
  httpRoutes: Array<{ method: string; path: string; handler: string; line: number }>;
};

function mapResult(raw: RawFileResult): GoParseResult {
  return {
    symbols: (raw.symbols ?? []).map((s) => ({
      name: s.name,
      kind: s.kind as SymbolKind,
      startLine: s.startLine,
      endLine: s.endLine,
    })),
    relations: (raw.relations ?? []).map((r) => ({
      from: r.from,
      to: r.to,
      kind: r.kind as SymbolRelation["kind"],
    })),
    httpRoutes: raw.httpRoutes ?? [],
  };
}

function runParser(args: string[], stdinData: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const bin = ensureBinary();
    const child = spawn(bin, args, { timeout: 30000 });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    child.stdin.write(stdinData);
    child.stdin.end();

    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr));
    });
  });
}

export async function extractSymbolsFromGoFile(
  filePath: string,
  globalGoSymbols?: string[],
): Promise<GoParseResult> {
  try {
    const result = await runParser([filePath], JSON.stringify(globalGoSymbols ?? []));
    return mapResult(JSON.parse(result));
  } catch {
    return { symbols: [], relations: [], httpRoutes: [] };
  }
}

export async function batchExtractGoFiles(
  filePaths: string[],
  externalSymbols?: string[],
): Promise<Map<string, GoParseResult>> {
  if (filePaths.length === 0) return new Map();

  try {
    const input = JSON.stringify({
      files: filePaths,
      externalSymbols: externalSymbols ?? [],
    });
    const result = await runParser([], input);

    if (filePaths.length === 1) {
      const raw = JSON.parse(result) as RawFileResult;
      return new Map([[filePaths[0], mapResult(raw)]]);
    }

    const rawMap = JSON.parse(result) as Record<string, RawFileResult>;
    const resultMap = new Map<string, GoParseResult>();
    for (const [file, raw] of Object.entries(rawMap)) {
      resultMap.set(file, mapResult(raw));
    }
    return resultMap;
  } catch {
    return new Map();
  }
}
