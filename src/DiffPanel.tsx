import { useState, useEffect, useMemo } from "react";
import { Search, FolderOpen, FileText } from "lucide-react";
import { filterDiffFiles, type DiffFileEntry } from "./diff-filters";

type DiffLine = {
  type: "add" | "del" | "context" | "hunk";
  content: string;
};

type DiffFile = {
  path: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
  rawContent: string;
};

function parseDiff(raw: string): DiffFile[] {
  const sections = raw.split(/(?=^diff --git )/m).filter(Boolean);
  return sections.map((section) => {
    const sectionLines = section.split("\n");
    const match = sectionLines[0].match(/^diff --git a\/.+? b\/(.+)/);
    const path = match ? match[1] : "unknown";

    let additions = 0;
    let deletions = 0;
    const lines: DiffLine[] = [];

    for (const line of sectionLines) {
      if (
        line.startsWith("diff --git") ||
        line.startsWith("index ") ||
        line.startsWith("--- ") ||
        line.startsWith("+++ ") ||
        line.startsWith("new file") ||
        line.startsWith("deleted file")
      ) {
        continue;
      }
      if (line.startsWith("@@")) {
        lines.push({ type: "hunk", content: line });
      } else if (line.startsWith("+")) {
        additions++;
        lines.push({ type: "add", content: line.slice(1) });
      } else if (line.startsWith("-")) {
        deletions++;
        lines.push({ type: "del", content: line.slice(1) });
      } else if (line !== "\\ No newline at end of file") {
        lines.push({ type: "context", content: line.startsWith(" ") ? line.slice(1) : line });
      }
    }

    return { path, additions, deletions, lines, rawContent: section };
  });
}

type Props = {
  repo: string;
  prNumber: number;
};

export function DiffPanel({ repo, prNumber }: Props) {
  const [diff, setDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pathQuery, setPathQuery] = useState("");
  const [textQuery, setTextQuery] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ repo, number: String(prNumber) });
    fetch(`/api/pr-diff?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((data) => setDiff(data.diff))
      .catch((e) => setError(e instanceof Error ? e.message : "取得に失敗しました"))
      .finally(() => setLoading(false));
  }, [repo, prNumber]);

  const allFiles = useMemo(() => (diff ? parseDiff(diff) : []), [diff]);

  const filterEntries: DiffFileEntry[] = useMemo(
    () => allFiles.map((f) => ({ path: f.path, rawContent: f.rawContent })),
    [allFiles],
  );

  const filteredPaths = useMemo(() => {
    const result = filterDiffFiles(filterEntries, pathQuery, textQuery);
    return new Set(result.map((f) => f.path));
  }, [filterEntries, pathQuery, textQuery]);

  const filteredFiles = useMemo(
    () => allFiles.filter((f) => filteredPaths.has(f.path)),
    [allFiles, filteredPaths],
  );

  if (loading) return <div className="diff-panel-status">diff を読み込み中…</div>;
  if (error) return <div className="diff-panel-status diff-panel-error">{error}</div>;
  if (!diff) return <div className="diff-panel-status">差分なし</div>;

  return (
    <div className="diff-panel">
      <div className="diff-filter-bar">
        <div className="diff-filter-input-wrap">
          <FolderOpen size={14} className="diff-filter-icon" />
          <input
            type="text"
            className="diff-filter-input"
            placeholder="パス / ファイル名で絞り込み…"
            value={pathQuery}
            onChange={(e) => setPathQuery(e.target.value)}
          />
        </div>
        <div className="diff-filter-input-wrap">
          <Search size={14} className="diff-filter-icon" />
          <input
            type="text"
            className="diff-filter-input"
            placeholder="テキストで絞り込み…"
            value={textQuery}
            onChange={(e) => setTextQuery(e.target.value)}
          />
        </div>
        <span className="diff-filter-count">
          <FileText size={12} />
          {filteredFiles.length}/{allFiles.length}
        </span>
      </div>

      <div className="diff-panel-content">
        {filteredFiles.length === 0 ? (
          <div className="diff-panel-status">一致するファイルがありません</div>
        ) : (
          filteredFiles.map((file, i) => (
            <div key={i} className="diff-file">
              <div className="diff-file-header">
                <span className="diff-file-path">{file.path}</span>
                <span className="diff-file-stats">
                  {file.additions > 0 && <span className="diff-stat-add">+{file.additions}</span>}
                  {file.deletions > 0 && <span className="diff-stat-del">-{file.deletions}</span>}
                </span>
              </div>
              <div className="diff-file-body">
                {file.lines.map((line, j) => (
                  <div key={j} className={`diff-line diff-line-${line.type}`}>
                    <span className="diff-line-marker">
                      {line.type === "add" ? "+" : line.type === "del" ? "-" : line.type === "hunk" ? "" : " "}
                    </span>
                    <span className="diff-line-content">
                      {line.type === "hunk" ? line.content : line.content || " "}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
