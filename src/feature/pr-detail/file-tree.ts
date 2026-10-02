export type FileEntry = { path: string; additions: number; deletions: number };

export type TreeNode = {
  name: string;
  children: Map<string, TreeNode>;
  files: FileEntry[];
};

export function buildTree(files: FileEntry[]): TreeNode {
  const root: TreeNode = { name: "", children: new Map(), files: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      let child = node.children.get(dir);
      if (!child) {
        child = { name: dir, children: new Map(), files: [] };
        node.children.set(dir, child);
      }
      node = child;
    }
    node.files.push(f);
  }
  return root;
}

export function collectFilePaths(node: TreeNode): string[] {
  const paths = node.files.map((f) => f.path);
  for (const child of node.children.values()) {
    paths.push(...collectFilePaths(child));
  }
  return paths;
}

export type FolderSelectionState = "all" | "some" | "none";

export function folderSelectionState(selected: Set<string>, paths: string[]): FolderSelectionState {
  const count = paths.filter((p) => selected.has(p)).length;
  if (count === 0) {
    return "none";
  }
  return count === paths.length ? "all" : "some";
}

// 配下がすべて選択済みなら配下だけ外し、そうでなければ配下をすべて追加する(他ディレクトリの選択は残す)
export function toggleFolderSelection(selected: Set<string>, paths: string[]): Set<string> {
  const next = new Set(selected);
  if (folderSelectionState(selected, paths) === "all") {
    for (const p of paths) {
      next.delete(p);
    }
  } else {
    for (const p of paths) {
      next.add(p);
    }
  }
  return next;
}
