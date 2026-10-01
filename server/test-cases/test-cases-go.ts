import { runGoTool } from "../go-tool/go-tool";

export type GoTestKind = "test" | "benchmark" | "fuzz";

export type GoTestCase = {
  kind: GoTestKind;
  names: string[];
  line: number;
  dynamic: boolean;
};

export type GoTestFile = { path: string; cases: GoTestCase[] };


export function extractGoTestCases(files: { path: string; content: string }[]): Promise<GoTestFile[]> {
  if (files.length === 0) return Promise.resolve([]);
  return runGoTool<GoTestFile[]>("gotests", files);
}
