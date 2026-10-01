import { runGoTool } from "../go-tool/go-tool";

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


export function extractGoDocs(packages: GoPackageInput[]): Promise<GoPackageDoc[]> {
  if (packages.length === 0) return Promise.resolve([]);
  return runGoTool<GoPackageDoc[]>("godoc", packages);
}
