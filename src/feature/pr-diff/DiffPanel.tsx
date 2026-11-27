import { Fragment, useState, useEffect, useMemo, useCallback } from "react";
import { Search, FolderOpen, FileText, ChevronDown, ChevronRight, MessageSquarePlus } from "lucide-react";
import { filterDiffFiles, type DiffFileEntry } from "./diff-filters";
import { parseDiff } from "./diff-parse";
import { buildThreadAnchor, lineLabel, type ThreadAnchor, type ThreadMessage } from "./diff-threads";
import { loadThreads, appendThreadMessage, removeThread, type ThreadMap } from "./diff-thread-storage";
import { DiffThreadView } from "./DiffThreadView";
import { initSession, useSession } from "../session-store/session-store";
import { countViewed, resolveCollapsed, type FoldRecords, type ViewedStates } from "./diff-viewed";
import { languageFromPath, highlightLine } from "./diff-highlight";
import { stepFontSize, parseFontSize } from "./diff-font-size";
import { isMarkdown } from "./diff-markdown";
import { MarkdownPreview } from "./MarkdownPreview";
import { MarpPreview } from "./MarpPreview";
import { clickLine, isLineSelected, selectionRange, type LineSelection } from "./diff-line-selection";
import { appStorage } from "../../app-storage";

const FONT_SIZE_STORAGE_KEY = "gh-chillbox:diff-font-size";

type Props = {
  repo: string;
  prNumber: number;
  prTitle?: string;
  prBody?: string;
  onFileHeaderClick?: (path: string) => void;
};

function loadFoldRecords(repo: string, prNumber: number): FoldRecords {
  try {
    const raw = appStorage.getItem(`gh-chillbox:${repo}:${prNumber}:diff-fold`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveFoldRecords(repo: string, prNumber: number, records: FoldRecords) {
  try {
    appStorage.setItem(`gh-chillbox:${repo}:${prNumber}:diff-fold`, JSON.stringify(records));
  } catch {}
}

const MD_MODES = ["raw", "preview", "slide"] as const;
type MdMode = (typeof MD_MODES)[number];

export function DiffPanel({ repo, prNumber, prTitle = "", prBody = "", onFileHeaderClick }: Props) {
  const [diff, setDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pathQuery, setPathQuery] = useState("");
  const [textQuery, setTextQuery] = useState("");
  const [foldRecords, setFoldRecords] = useState<FoldRecords>(() => loadFoldRecords(repo, prNumber));
  // Diff タブを離れている間に届いた回答も、戻ったときにすぐ表示できるよう置き場所に持つ
  const threadsKey = `diff-threads:${repo}:${prNumber}`;
  initSession(threadsKey, () => loadThreads(repo, prNumber));
  const [threads, setThreads] = useSession<ThreadMap>(threadsKey, {});
  const [pending, setPending] = useState<ThreadAnchor | null>(null);
  const [lineSelection, setLineSelection] = useState<LineSelection | null>(null);
  const [pullRequestId, setPullRequestId] = useState<string | null>(null);
  const [viewedStates, setViewedStates] = useState<ViewedStates>({});
  // viewed の状態が取れるまでは、自分の開け閉めの記録だけで決める
  const collapsedFiles = useMemo(
    () => resolveCollapsed(foldRecords, pullRequestId ? viewedStates : null),
    [foldRecords, pullRequestId, viewedStates],
  );
  const [mdModes, setMdModes] = useState<Map<string, MdMode>>(new Map());
  const [fontSize, setFontSize] = useState(() => {
    try {
      return parseFontSize(appStorage.getItem(FONT_SIZE_STORAGE_KEY));
    } catch {
      return parseFontSize(null);
    }
  });

  const changeFontSize = (delta: 1 | -1) => {
    const next = stepFontSize(fontSize, delta);
    setFontSize(next);
    try {
      appStorage.setItem(FONT_SIZE_STORAGE_KEY, String(next));
    } catch {}
  };

  useEffect(() => {
    setPending(null);
    setLineSelection(null);
  }, [repo, prNumber]);

  const handleAppend = useCallback(
    (anchor: ThreadAnchor, msg: ThreadMessage) => {
      setThreads(appendThreadMessage(repo, prNumber, anchor, msg));
      setPending((p) => (p?.key === anchor.key ? null : p));
    },
    [repo, prNumber],
  );

  const handleDelete = useCallback(
    (key: string) => {
      setThreads(removeThread(repo, prNumber, key));
      fetch("/api/chat/session", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, prNumber, threadKey: key }),
      }).catch(() => {});
    },
    [repo, prNumber],
  );

  const setCollapsed = useCallback(
    (path: string, collapsed: boolean, viewed: boolean) => {
      setFoldRecords((prev) => {
        const next = { ...prev, [path]: { collapsed, viewed } };
        saveFoldRecords(repo, prNumber, next);
        return next;
      });
    },
    [repo, prNumber],
  );

  const toggleCollapse = useCallback(
    (path: string) => setCollapsed(path, !collapsedFiles.has(path), viewedStates[path] === "VIEWED"),
    [setCollapsed, collapsedFiles, viewedStates],
  );

  const setMdMode = (path: string, mode: MdMode) => {
    setMdModes((prev) => new Map(prev).set(path, mode));
  };
  const mdModeOf = (path: string): MdMode => mdModes.get(path) ?? "raw";

  useEffect(() => {
    setPullRequestId(null);
    setViewedStates({});
    const params = new URLSearchParams({ repo, number: String(prNumber) });
    fetch(`/api/pr-viewed?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) {
          return;
        }
        setPullRequestId(data.pullRequestId);
        setViewedStates(data.states);
      })
      .catch(() => {});
  }, [repo, prNumber]);

  // GitHub の Files changed と同じく、viewed にしたら畳み、外したら開く
  const toggleViewed = useCallback(
    (path: string, viewed: boolean) => {
      if (!pullRequestId) {
        return;
      }
      const prevState = viewedStates[path];
      setViewedStates((s) => ({ ...s, [path]: viewed ? "VIEWED" : "UNVIEWED" }));
      setCollapsed(path, viewed, viewed);
      fetch("/api/pr-viewed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pullRequestId, path, viewed }),
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
          }
        })
        .catch(() => {
          setViewedStates((s) => ({ ...s, [path]: prevState }));
          setCollapsed(path, !viewed, prevState === "VIEWED");
        });
    },
    [pullRequestId, viewedStates, setCollapsed],
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ repo, number: String(prNumber) });
    fetch(`/api/pr-diff?${params}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }
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

  const filteredFiles = useMemo(() => allFiles.filter((f) => filteredPaths.has(f.path)), [allFiles, filteredPaths]);

  const highlightedLines = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const f of allFiles) {
      const language = languageFromPath(f.path);
      map.set(
        f.path,
        f.lines.map((l) => (l.type === "hunk" ? "" : highlightLine(l.content || " ", language))),
      );
    }
    return map;
  }, [allFiles]);

  const viewedCount = useMemo(
    () =>
      countViewed(
        allFiles.map((f) => f.path),
        viewedStates,
      ),
    [allFiles, viewedStates],
  );

  const selectedAnchor = useMemo(() => {
    if (!lineSelection) {
      return null;
    }
    const file = allFiles.find((f) => f.path === lineSelection.path);
    const [lo, hi] = selectionRange(lineSelection);
    return file ? buildThreadAnchor(file, lo, hi) : null;
  }, [lineSelection, allFiles]);

  const handleStartThread = () => {
    if (!selectedAnchor) {
      return;
    }
    if (!threads[selectedAnchor.key]) {
      setPending(selectedAnchor);
    }
    setLineSelection(null);
  };

  const threadsEndingAt = (path: string, label: string | null) => {
    if (!label) {
      return [];
    }
    const list: { anchor: ThreadAnchor; messages: ThreadMessage[] }[] = Object.values(threads)
      .filter((t) => t.path === path && t.end === label)
      .map(({ messages, ...anchor }) => ({ anchor, messages }));
    if (pending && pending.path === path && pending.end === label && !threads[pending.key]) {
      list.push({ anchor: pending, messages: [] });
    }
    return list;
  };

  if (loading) {
    return <div className="diff-panel-status">diff を読み込み中…</div>;
  }
  if (error) {
    return <div className="diff-panel-status diff-panel-error">{error}</div>;
  }
  if (!diff) {
    return <div className="diff-panel-status">差分なし</div>;
  }

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
        <span className="diff-font-size">
          <button
            type="button"
            className="diff-font-size-btn"
            onClick={() => changeFontSize(-1)}
            title="コードの文字を小さくする"
          >
            A-
          </button>
          <span className="diff-font-size-value">{fontSize}px</span>
          <button
            type="button"
            className="diff-font-size-btn"
            onClick={() => changeFontSize(1)}
            title="コードの文字を大きくする"
          >
            A+
          </button>
        </span>
      </div>

      <div className="diff-panel-content">
        {filteredFiles.length === 0 ? (
          <div className="diff-panel-status">一致するファイルがありません</div>
        ) : (
          filteredFiles.map((file, i) => {
            const collapsed = collapsedFiles.has(file.path);
            return (
              <div key={i} className="diff-file">
                <div
                  className="diff-file-header"
                  data-file-header={file.path}
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
                  {isMarkdown(file.path) && (
                    <span className="diff-md-mode" onClick={(e) => e.stopPropagation()}>
                      {MD_MODES.map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={`diff-md-mode-btn${mdModeOf(file.path) === mode ? " active" : ""}`}
                          onClick={() => setMdMode(file.path, mode)}
                        >
                          {mode}
                        </button>
                      ))}
                    </span>
                  )}
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
                {!collapsed && mdModeOf(file.path) === "preview" && (
                  <MarkdownPreview
                    repo={repo}
                    prNumber={prNumber}
                    path={file.path}
                    lines={file.lines}
                    fontSize={fontSize}
                  />
                )}
                {!collapsed && mdModeOf(file.path) === "slide" && (
                  <MarpPreview repo={repo} prNumber={prNumber} path={file.path} fontSize={fontSize} />
                )}
                {!collapsed && mdModeOf(file.path) === "raw" && (
                  <div className="diff-file-body" data-path={file.path} style={{ fontSize }}>
                    {file.lines.map((line, j) => (
                      <Fragment key={j}>
                        <div
                          data-line-idx={j}
                          className={`diff-line diff-line-${line.type}${isLineSelected(lineSelection, file.path, j) ? " diff-line-selected" : ""}`}
                        >
                          {[line.oldLine, line.newLine].map((num, side) => (
                            <span
                              key={side}
                              className={`diff-line-num${line.type === "hunk" ? "" : " diff-line-num-selectable"}`}
                              // Shift+クリックでコードの文字まで選択されないようにする
                              onMouseDown={(e) => e.shiftKey && e.preventDefault()}
                              onClick={(e) => {
                                if (line.type !== "hunk") {
                                  setLineSelection((prev) => clickLine(prev, file.path, j, e.shiftKey));
                                }
                              }}
                            >
                              {num ?? ""}
                            </span>
                          ))}
                          <span className="diff-line-marker">
                            {line.type === "add" ? "+" : line.type === "del" ? "-" : line.type === "hunk" ? "" : " "}
                          </span>
                          {line.type === "hunk" ? (
                            <span className="diff-line-content">{line.content}</span>
                          ) : (
                            <span
                              className="diff-line-content"
                              dangerouslySetInnerHTML={{ __html: highlightedLines.get(file.path)?.[j] ?? "" }}
                            />
                          )}
                        </div>
                        {selectedAnchor &&
                          lineSelection?.path === file.path &&
                          selectionRange(lineSelection)[1] === j && (
                            <button
                              type="button"
                              className="quote-floating-btn diff-line-ask-btn"
                              onClick={handleStartThread}
                            >
                              <MessageSquarePlus size={14} />
                              この行について質問
                            </button>
                          )}
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
    </div>
  );
}
