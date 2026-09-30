import { describe, it, expect } from "vitest";
import { goPackageDirs, pairPackages } from "./godoc-collect";
import type { GoPackageDoc, GoDocItem } from "./godoc";

function item(name: string, decl = `func ${name}()`): GoDocItem {
  return { kind: "func", name, decl, docText: "", docHtml: "" };
}

function pkg(dir: string, name: string, items: GoDocItem[]): GoPackageDoc {
  return { dir, name, docText: "", docHtml: "", items };
}

describe("goPackageDirs", () => {
  it(".go ファイルのあるディレクトリを重複なし・パス順で返す", () => {
    expect(goPackageDirs(["b/x.go", "a/y.go", "b/z.go", "main.go"])).toEqual([".", "a", "b"]);
  });

  it("_test.go だけのディレクトリ、.go 以外、vendor と testdata 配下は除く", () => {
    expect(goPackageDirs([
      "a/a_test.go",
      "b/README.md",
      "vendor/lib/x.go",
      "pkg/testdata/sample.go",
      "c/c.go",
    ])).toEqual(["c"]);
  });
});

describe("pairPackages", () => {
  it("dir+パッケージ名で突き合わせ、パッケージ内のシンボルを比べる", () => {
    const [result] = pairPackages(
      [pkg("u", "user", [item("Keep"), item("Old")])],
      [pkg("u", "user", [item("Keep"), item("New")])],
    );
    expect(result.change).toBe("modified");
    expect(result.items.map((i) => [i.name, i.change])).toEqual([
      ["Keep", "unchanged"],
      ["New", "added"],
      ["Old", "removed"],
    ]);
  });

  it("シンボルもパッケージ doc も同じなら unchanged", () => {
    const [result] = pairPackages([pkg("u", "user", [item("A")])], [pkg("u", "user", [item("A")])]);
    expect(result.change).toBe("unchanged");
  });

  it("パッケージ doc だけが変わっても modified", () => {
    const base = { ...pkg("u", "user", []), docText: "古い\n" };
    const head = { ...pkg("u", "user", []), docText: "新しい\n" };
    expect(pairPackages([base], [head])[0].change).toBe("modified");
  });

  it("head にだけあるパッケージは added、base にだけあるパッケージは removed で、シンボルもそれぞれ同じ印になる", () => {
    const result = pairPackages([pkg("old", "old", [item("A")])], [pkg("new", "new", [item("B")])]);
    expect(result.map((p) => [p.dir, p.change, p.items.map((i) => i.change)])).toEqual([
      ["new", "added", ["added"]],
      ["old", "removed", ["removed"]],
    ]);
  });
});
