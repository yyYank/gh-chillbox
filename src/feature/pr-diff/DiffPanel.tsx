import { Fragment, useState, useEffect, useMemo, useCallback } from "react";
import { Search, FolderOpen, FileText, ChevronDown, ChevronRight, MessageSquarePlus } from "lucide-react";
import { filterDiffFiles, type DiffFileEntry } from "./diff-filters";
import { parseDiff } from "./diff-parse";
import { buildThreadAnchor, lineLabel, type ThreadAnchor, type ThreadMessage } from "./diff-threads";
import { loadThreads, appendThreadMessage, removeThread, type ThreadMap } from "./diff-thread-storage";
import { DiffThreadView } from "./DiffThreadView";
import { countViewed, type ViewedStates } from "./diff-viewed";

type Props = {
  repo: string;
  prNumber: number;
  prTitle?: string;
  prBody?: string;
  onFileHeaderClick?: (path: string) => void;
};

function lineIdxOf(node: Node): { path: string; idx: number } | null {
  const el = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>("[data-line-idx]");
  const body = el?.closest<HTMLElement>("[data-path]");
  if (!el || !body) return null;
  return { path: body.dataset.path!, idx: Number(el.dataset.lineIdx) };
}

function loadCollapsed(repo: string, prNumber: number): Set<string> {
  try {
    const raw = localStorage.getItem(`gh-chillbox:${repo}:${prNumber}:diff-collapsed`);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveCollapsed(repo: string, prNumber: number, collapsed: Set<string>) {
  try {
    localStorage.setItem(`gh-chillbox:${repo}:${prNumber}:diff-collapsed`, JSON.stringify([...collapsed]));
  } catch {}
}

export function DiffPanel({ repo, prNumber, prTitle = "", prBody = "", onFileHeaderClick }: Props) {
  const [diff, setDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pathQuery, setPathQuery] = useState("");
  const [textQuery, setTextQuery] = useState("");
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(() => loadCollapsed(repo, prNumber));
  const [threads, setThreads] = useState<ThreadMap>(() => loadThreads(repo, prNumber));
  const [pending, setPending] = useState<ThreadAnchor | null>(null);
  const [floatingBtn, setFloatingBtn] = useState<{ x: number; y: number; anchor: ThreadAnchor } | null>(null);
  const [pullRequestId, setPullRequestId] = useState<string | null>(null);
  const [viewedStates, setViewedStates] = useState<ViewedStates>({});

  useEffect(() => {
    setThreads(loadThreads(repo, prNumber));
    setPending(null);
  }, [repo, prNumber]);

  const handleAppend = useCallback((anchor: ThreadAnchor, msg: ThreadMessage) => {
    setThreads(appendThreadMessage(repo, prNumber, anchor, msg));
    setPending((p) => (p?.key === anchor.key ? null : p));
  }, [repo, prNumber]);

  const handleDelete = useCallback((key: string) => {
    setThreads(removeThread(repo, prNumber, key));
    fetch("/api/chat/session", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo, prNumber, threadKey: key }),
    }).catch(() => {});
  }, [repo, prNumber]);

  const setCollapsed = useCallback((path: string, collapsed?: boolean) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (collapsed ?? !next.has(path)) {
        next.add(path);
      } else {
        next.delete(path);
      }
      saveCollapsed(repo, prNumber, next);
      return next;
    });
  }, [repo, prNumber]);

  const toggleCollapse = useCallback((path: string) => setCollapsed(path), [setCollapsed]);

  useEffect(() => {
    setPullRequestId(null);
    setViewedStates({});
    const params = new URLSearchParams({ repo, number: String(prNumber) });
    fetch(`/api/pr-viewed?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setPullRequestId(data.pullRequestId);
        setViewedStates(data.states);
      })
      .catch(() => {});
  }, [repo, prNumber]);

  // GitHub の Files changed と同じく、viewed にしたら畳み、外したら開く
  const toggleViewed = useCallback((path: string, viewed: boolean) => {
    if (!pullRequestId) return;
    const prevState = viewedStates[path];
    setViewedStates((s) => ({ ...s, [path]: viewed ? "VIEWED" : "UNVIEWED" }));
    setCollapsed(path, viewed);
    fetch("/api/pr-viewed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pullRequestId, path, viewed }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
      })
      .catch(() => {
        setViewedStates((s) => ({ ...s, [path]: prevState }));
        setCollapsed(path, !viewed);
      });
  }, [pullRequestId, viewedStates, setCollapsed]);

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

  const viewedCount = useMemo(() => countViewed(allFiles.map((f) => f.path), viewedStates), [allFiles, viewedStates]);

  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setFloatingBtn(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const from = lineIdxOf(range.startContainer);
    const to = lineIdxOf(range.endContainer);
    if (!from || !to || from.path !== to.path) {
      setFloatingBtn(null);
      return;
    }
    // 行末まで選ぶと終点が次の行の先頭になるので、その行は含めない
    const toIdx = range.endOffset === 0 && to.idx > from.idx ? to.idx - 1 : to.idx;
    const file = allFiles.find((f) => f.path === from.path);
    const anchor = file && buildThreadAnchor(file, from.idx, toIdx);
    if (!anchor) {
      setFloatingBtn(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    setFloatingBtn({ x: rect.left + rect.width / 2, y: rect.top - 8, anchor });
  };

  const handleStartThread = () => {
    if (!floatingBtn) return;
    if (!threads[floatingBtn.anchor.key]) setPending(floatingBtn.anchor);
    setFloatingBtn(null);
    window.getSelection()?.removeAllRanges();
  };

  const threadsEndingAt = (path: string, label: string | null) => {
    if (!label) return [];
    const list: { anchor: ThreadAnchor; messages: ThreadMessage[] }[] = Object.values(threads)
      .filter((t) => t.path === path && t.end === label)
      .map(({ messages, ...anchor }) => ({ anchor, messages }));
    if (pending && pending.path === path && pending.end === label && !threads[pending.key]) {
      list.push({ anchor: pending, messages: [] });
    }
    return list;
  };

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
        {pullRequestId && (
          <span className="diff-viewed-count">
            {viewedCount.viewed} / {viewedCount.total} files viewed
          </span>
        )}
      </div>

      <div className="diff-panel-content" onMouseUp={handleMouseUp}>
        {filteredFiles.length === 0 ? (
          <div className="diff-panel-status">一致するファイルがありません</div>
        ) : (
          filteredFiles.map((file, i) => {
            const collapsed = collapsedFiles.has(file.path);
            return (
              <div key={i} className="diff-file">
                <div
                  className="diff-file-header"
                  onClick={() => {
                    onFileHeaderClick?.(file.path);
                  }}
                >
                  <button
                    type="button"
                    className="diff-collapse-toggle"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCollapse(file.path);
                    }}
                  >
                    {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <span className="diff-file-path">{file.path}</span>
                  <span className="diff-file-stats">
                    {file.additions > 0 && <span className="diff-stat-add">+{file.additions}</span>}
                    {file.deletions > 0 && <span className="diff-stat-del">-{file.deletions}</span>}
                  </span>
                  {pullRequestId && (
                    <span className="diff-viewed" onClick={(e) => e.stopPropagation()}>
                      {viewedStates[file.path] === "DISMISSED" && (
                        <span className="diff-viewed-dismissed">Changed since last view</span>
                      )}
                      <label className={`diff-viewed-toggle${viewedStates[file.path] === "VIEWED" ? " checked" : ""}`}>
                        <input
                          type="checkbox"
                          checked={viewedStates[file.path] === "VIEWED"}
                          onChange={(e) => toggleViewed(file.path, e.target.checked)}
                        />
                        Viewed
                      </label>
                    </span>
                  )}
                </div>
                {!collapsed && (
                  <div className="diff-file-body" data-path={file.path}>
                    {file.lines.map((line, j) => (
                      <Fragment key={j}>
                        <div data-line-idx={j} className={`diff-line diff-line-${line.type}`}>
                          <span className="diff-line-num">{line.oldLine ?? ""}</span>
                          <span className="diff-line-num">{line.newLine ?? ""}</span>
                          <span className="diff-line-marker">
                            {line.type === "add" ? "+" : line.type === "del" ? "-" : line.type === "hunk" ? "" : " "}
                          </span>
                          <span className="diff-line-content">
                            {line.type === "hunk" ? line.content : line.content || " "}
                          </span>
                        </div>
                        {threadsEndingAt(file.path, lineLabel(line)).map(({ anchor, messages }) => (
                          <DiffThreadView
                            key={anchor.key}
                            anchor={anchor}
                            messages={messages}
                            repo={repo}
                            prNumber={prNumber}
                            prTitle={prTitle}
                            prBody={prBody}
                            onAppend={handleAppend}
                            onDelete={handleDelete}
                            onCancel={() => setPending(null)}
                          />
                        ))}
                      </Fragment>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {floatingBtn && (
        <button
          type="button"
          className="quote-floating-btn"
          style={{ position: "fixed", left: floatingBtn.x, top: floatingBtn.y, transform: "translate(-50%, -100%)" }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleStartThread}
        >
          <MessageSquarePlus size={14} />
          この行について質問
        </button>
      )}
    </div>
  );
}
