import { describe, it, expect } from "vitest";
import { diffGoDocItems } from "./godoc-diff";
import type { GoDocItem } from "./godoc";

function item(kind: GoDocItem["kind"], name: string, decl = `${kind} ${name}`, docText = ""): GoDocItem {
  return { kind, name, decl, docText, docHtml: "" };
}

describe("diffGoDocItems", () => {
  it("kind+name で突き合わせ、head にだけあるものを added、base にだけあるものを removed にする", () => {
    const result = diffGoDocItems(
      [item("func", "Keep"), item("func", "Old")],
      [item("func", "Keep"), item("func", "New")],
    );
    expect(result.map((i) => [i.name, i.change])).toEqual([
      ["Keep", "unchanged"],
      ["New", "added"],
      ["Old", "removed"],
    ]);
  });

  it("同じ名前でも kind が違えば別のシンボルとして扱う", () => {
    const result = diffGoDocItems([item("type", "User")], [item("func", "User")]);
    expect(result.map((i) => [i.kind, i.change])).toEqual([
      ["func", "added"],
      ["type", "removed"],
    ]);
  });

  it("signature が変われば modified で changedParts に signature を入れる", () => {
    const [result] = diffGoDocItems(
      [item("func", "F", "func F(a int)")],
      [item("func", "F", "func F(a int, b string)")],
    );
    expect(result.change).toBe("modified");
    expect(result.changedParts).toEqual(["signature"]);
  });

  it("doc コメントだけが変われば changedParts は doc", () => {
    const [result] = diffGoDocItems(
      [item("func", "F", "func F()", "古い説明\n")],
      [item("func", "F", "func F()", "新しい説明\n")],
    );
    expect(result.changedParts).toEqual(["doc"]);
  });
});
