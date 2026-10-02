import { useState } from "react";
import { ChevronDown, ChevronRight, Folder, FileText } from "lucide-react";
import { buildTree, collectFilePaths, folderSelectionState, type FileEntry, type TreeNode } from "./file-tree";

type SelectionSet = Set<string>;

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

function FolderNode({
  node,
  depth,
  parentPath,
  storagePrefix,
  selectedFiles,
  onFileClick,
  onFolderToggle,
}: {
  node: TreeNode;
  depth: number;
  parentPath: string;
  storagePrefix: string;
  selectedFiles?: SelectionSet;
  onFileClick?: (path: string, e: React.MouseEvent) => void;
  onFolderToggle?: (paths: string[]) => void;
}) {
  const folderPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  const storageKey = `${storagePrefix}:folder:${folderPath}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== "false";
    } catch {
      return true;
    }
  });
  const fileCount = countFiles(node);
  const stats = sumStats(node);
  const folderFilePaths = collectFilePaths(node);
  const selectionState = folderSelectionState(selectedFiles ?? new Set(), folderFilePaths);
  const sortedDirs = [...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const sortedFiles = [...node.files].sort((a, b) => {
    const aName = a.path.split("/").pop() ?? "";
    const bName = b.path.split("/").pop() ?? "";
    return aName.localeCompare(bName);
  });

  return (
    <li className="tree-folder">
      <div className="tree-folder-row">
        <button
          type="button"
          className="tree-folder-toggle"
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          onClick={() => {
            const next = !open;
            setOpen(next);
            try {
              localStorage.setItem(storageKey, String(next));
            } catch {}
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
        {onFolderToggle && (
          <input
            type="checkbox"
            className="select-all-checkbox"
            title={`${folderPath}/ 以下を選択`}
            checked={selectionState === "all"}
            ref={(el) => {
              if (el) {
                el.indeterminate = selectionState === "some";
              }
            }}
            onChange={() => onFolderToggle(folderFilePaths)}
          />
        )}
      </div>
      {open && (
        <ul className="tree-children">
          {sortedDirs.map(([name, child]) => (
            <FolderNode
              key={name}
              node={child}
              depth={depth + 1}
              parentPath={folderPath}
              storagePrefix={storagePrefix}
              selectedFiles={selectedFiles}
              onFileClick={onFileClick}
              onFolderToggle={onFolderToggle}
            />
          ))}
          {sortedFiles.map((f) => {
            const fileName = f.path.split("/").pop() ?? "";
            const selected = selectedFiles?.has(f.path) ?? false;
            return (
              <li
                key={f.path}
                className={`tree-file${selected ? " tree-file-selected" : ""}`}
                style={{ paddingLeft: `${(depth + 1) * 16 + 12}px` }}
                data-filepath={f.path}
                onClick={(e) => onFileClick?.(f.path, e)}
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
  selectedFiles?: SelectionSet;
  onFileClick?: (path: string, e: React.MouseEvent) => void;
  onFolderToggle?: (paths: string[]) => void;
};

export function FileTree({ files, storagePrefix, selectedFiles, onFileClick, onFolderToggle }: Props) {
  const tree = buildTree(files);

  const sortedDirs = [...tree.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const sortedRootFiles = [...tree.files].sort((a, b) => {
    const aName = a.path.split("/").pop() ?? "";
    const bName = b.path.split("/").pop() ?? "";
    return aName.localeCompare(bName);
  });

  return (
    <ul className="file-tree">
      {sortedDirs.map(([name, child]) => (
        <FolderNode
          key={name}
          node={child}
          depth={0}
          parentPath=""
          storagePrefix={storagePrefix}
          selectedFiles={selectedFiles}
          onFileClick={onFileClick}
          onFolderToggle={onFolderToggle}
        />
      ))}
      {sortedRootFiles.map((f) => {
        const fileName = f.path.split("/").pop() ?? "";
        const selected = selectedFiles?.has(f.path) ?? false;
        return (
          <li
            key={f.path}
            className={`tree-file${selected ? " tree-file-selected" : ""}`}
            style={{ paddingLeft: "12px" }}
            data-filepath={f.path}
            onClick={(e) => onFileClick?.(f.path, e)}
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
  );
}
