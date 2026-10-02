// server/godoc/godoc-collect.ts の DiffedGoPackage と同じ形（/api/godoc のレスポンス）
export type SymbolChange = "added" | "modified" | "removed" | "unchanged";

export type Scope = "changed" | "all";

export type GoDocItem = {
  kind: "const" | "var" | "type" | "func" | "method";
  name: string;
  decl: string;
  docText: string;
  docHtml: string;
  change: SymbolChange;
  changedParts: ("signature" | "doc")[];
};

export type GoPackage = {
  dir: string;
  name: string;
  docText: string;
  docHtml: string;
  change: SymbolChange;
  items: GoDocItem[];
};

export function visiblePackages(packages: GoPackage[], scope: Scope): GoPackage[] {
  if (scope === "all") {
    return packages;
  }
  return packages
    .filter((p) => p.change !== "unchanged")
    .map((p) => ({ ...p, items: p.items.filter((i) => i.change !== "unchanged") }));
}
