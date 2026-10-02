import { describe, it, expect } from "vitest";
import { buildTree, collectFilePaths, folderSelectionState, toggleFolderSelection } from "./file-tree";

const f = (path: string) => ({ path, additions: 0, deletions: 0 });

describe("collectFilePaths", () => {
  it("ディレクトリ配下のファイルを再帰的に集める", () => {
    const tree = buildTree([f("src/a.ts"), f("src/lib/b.ts"), f("src/lib/deep/c.ts"), f("README.md")]);
    const src = tree.children.get("src");
    expect(src && collectFilePaths(src).sort()).toEqual(["src/a.ts", "src/lib/b.ts", "src/lib/deep/c.ts"]);
  });
});

describe("folderSelectionState", () => {
  const paths = ["src/a.ts", "src/b.ts"];

  it("配下がすべて選択済みなら all", () => {
    expect(folderSelectionState(new Set(paths), paths)).toBe("all");
  });

  it("配下が一部だけ選択済みなら some", () => {
    expect(folderSelectionState(new Set(["src/a.ts"]), paths)).toBe("some");
  });

  it("配下が一つも選択されていなければ none", () => {
    expect(folderSelectionState(new Set(["other.ts"]), paths)).toBe("none");
  });
});

describe("toggleFolderSelection", () => {
  const paths = ["src/a.ts", "src/b.ts"];

  it("未選択なら配下をすべて追加し、他の選択は残す", () => {
    expect(toggleFolderSelection(new Set(["other.ts"]), paths)).toEqual(new Set(["other.ts", ...paths]));
  });

  it("一部選択なら配下をすべて追加する", () => {
    expect(toggleFolderSelection(new Set(["src/a.ts"]), paths)).toEqual(new Set(paths));
  });

  it("すべて選択済みなら配下だけ外し、他の選択は残す", () => {
    expect(toggleFolderSelection(new Set(["other.ts", ...paths]), paths)).toEqual(new Set(["other.ts"]));
  });
});
