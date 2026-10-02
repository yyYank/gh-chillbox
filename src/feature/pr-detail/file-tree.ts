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
