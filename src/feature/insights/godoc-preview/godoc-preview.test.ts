import { describe, it, expect } from "vitest";
import { visiblePackages, type GoPackage, type GoDocItem } from "./godoc-preview";

function item(name: string, change: GoDocItem["change"]): GoDocItem {
  return { kind: "func", name, decl: `func ${name}()`, docText: "", docHtml: "", change, changedParts: [] };
}

function pkg(dir: string, change: GoPackage["change"], items: GoDocItem[]): GoPackage {
  return { dir, name: dir, docText: "", docHtml: "", change, items };
}

describe("visiblePackages", () => {
  const pkgs = [
    pkg("same", "unchanged", [item("A", "unchanged")]),
    pkg("mod", "modified", [item("Keep", "unchanged"), item("New", "added"), item("Old", "removed")]),
  ];

  it("差分モードでは変わったパッケージの、変わったシンボルだけを返す", () => {
    const result = visiblePackages(pkgs, "changed");
    expect(result.map((p) => [p.dir, p.items.map((i) => i.name)])).toEqual([["mod", ["New", "Old"]]]);
  });

  it("全部モードではパッケージもシンボルもすべて返す", () => {
    const result = visiblePackages(pkgs, "all");
    expect(result.map((p) => p.items.length)).toEqual([1, 3]);
  });
});
