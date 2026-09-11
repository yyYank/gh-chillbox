import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { SymbolKind, SymbolRelation } from "./ast-types";

const execFileAsync = promisify(execFile);

export type ExtractedSymbol = {
  name: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
};

export type GoParseResult = {
  symbols: ExtractedSymbol[];
  relations: SymbolRelation[];
};

const TOOLS_DIR = path.resolve(import.meta.dirname, "tools");

export async function extractSymbolsFromGoFile(filePath: string): Promise<GoParseResult> {
  try {
    const { stdout } = await execFileAsync("go", ["run", ".", filePath], {
      cwd: TOOLS_DIR,
      timeout: 30000,
    });
    const raw = JSON.parse(stdout) as {
      symbols: Array<{ name: string; kind: string; startLine: number; endLine: number }>;
      relations: Array<{ from: string; to: string; kind: string }>;
    };
    return {
      symbols: raw.symbols.map((s) => ({
        name: s.name,
        kind: s.kind as SymbolKind,
        startLine: s.startLine,
        endLine: s.endLine,
      })),
      relations: raw.relations.map((r) => ({
        from: r.from,
        to: r.to,
        kind: r.kind as SymbolRelation["kind"],
      })),
    };
  } catch {
    return { symbols: [], relations: [] };
  }
}
