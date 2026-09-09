import { useState } from "react";
import { ChevronDown, ChevronRight, Folder, FileText } from "lucide-react";

type FileEntry = { path: string; additions: number; deletions: number };

type TreeNode = {
  name: string;
  children: Map<string, TreeNode>;
  files: FileEntry[];
};

function buildTree(files: FileEntry[]): TreeNode {
  const root: TreeNode = { name: "", children: new Map(), files: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      if (!node.children.has(dir)) {
        node.children.set(dir, { name: dir, children: new Map(), files: [] });
      }
      node = node.children.get(dir)!;
    }
    node.files.push(f);
  }
  return root;
}

function countFiles(node: TreeNode): number {
  let count = node.files.length;
  for (const child of node.children.values()) {
    count += countFiles(child);
  }
  return count;
}

function sumStats(node: TreeNode): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const f of node.files) {
    additions += f.additions;
    deletions += f.deletions;
  }
  for (const child of node.children.values()) {
    const s = sumStats(child);
    additions += s.additions;
    deletions += s.deletions;
  }
  return { additions, deletions };
}

function FolderNode({ node, depth, parentPath, storagePrefix }: { node: TreeNode; depth: number; parentPath: string; storagePrefix: string }) {
  const folderPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  const storageKey = `${storagePrefix}:folder:${folderPath}`;
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(storageKey) !== "false"; } catch { return true; }
  });
  const fileCount = countFiles(node);
  const stats = sumStats(node);
  const sortedDirs = [...node.children.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const sortedFiles = [...node.files].sort((a, b) => {
    const aName = a.path.split("/").pop()!;
    const bName = b.path.split("/").pop()!;
    return aName.localeCompare(bName);
  });

  return (
    <li className="tree-folder">
      <button
        type="button"
        className="tree-folder-toggle"
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        onClick={() => {
          const next = !open;
          setOpen(next);
          try { localStorage.setItem(storageKey, String(next)); } catch {}
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Folder size={14} className="tree-icon-folder" />
        <span className="tree-folder-name">{node.name}/</span>
        <span className="tree-folder-meta">
          {fileCount} files
          <span className="stat-add">+{stats.additions}</span>
          <span className="stat-del">-{stats.deletions}</span>
        </span>
      </button>
      {open && (
        <ul className="tree-children">
          {sortedDirs.map(([name, child]) => (
            <FolderNode key={name} node={child} depth={depth + 1} parentPath={folderPath} storagePrefix={storagePrefix} />
          ))}
          {sortedFiles.map((f) => {
            const fileName = f.path.split("/").pop()!;
            return (
              <li
                key={f.path}
                className="tree-file"
                style={{ paddingLeft: `${(depth + 1) * 16 + 12}px` }}
              >
                <FileText size={14} className="tree-icon-file" />
                <span className="tree-file-name">{fileName}</span>
                <span className="pr-detail-file-stat">
                  <span className="stat-add">+{f.additions}</span>
                  <span className="stat-del">-{f.deletions}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

type Props = {
  files: FileEntry[];
  storagePrefix: string;
};

export function FileTree({ files, storagePrefix }: Props) {
  const tree = buildTree(files);

  const sortedDirs = [...tree.children.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const sortedRootFiles = [...tree.files].sort((a, b) => {
    const aName = a.path.split("/").pop()!;
    const bName = b.path.split("/").pop()!;
    return aName.localeCompare(bName);
  });

  return (
    <ul className="file-tree">
      {sortedDirs.map(([name, child]) => (
        <FolderNode key={name} node={child} depth={0} parentPath="" storagePrefix={storagePrefix} />
      ))}
      {sortedRootFiles.map((f) => {
        const fileName = f.path.split("/").pop()!;
        return (
          <li key={f.path} className="tree-file" style={{ paddingLeft: "12px" }}>
            <FileText size={14} className="tree-icon-file" />
            <span className="tree-file-name">{fileName}</span>
            <span className="pr-detail-file-stat">
              <span className="stat-add">+{f.additions}</span>
              <span className="stat-del">-{f.deletions}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
