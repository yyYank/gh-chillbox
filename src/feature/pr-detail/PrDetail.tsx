import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { marked } from "marked";
import mermaid from "mermaid";
import { ArrowLeft, ChevronDown, ChevronRight, MessageSquareQuote } from "lucide-react";
import { FileTree } from "./FileTree";
import { ChatPanel } from "../chat/ChatPanel";
import { DiffPanel } from "../pr-diff/DiffPanel";
import { ChangeSurface } from "../insights/change-surface/ChangeSurface";
import { AstAnalysis } from "../insights/ast-analysis/AstAnalysis";
import { CallGraph } from "../insights/call-graph/CallGraph";

marked.setOptions({ gfm: true, breaks: true });

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const GITHUB_IMAGE_HOSTS = [
  "https://user-images.githubusercontent.com/",
  "https://private-user-images.githubusercontent.com/",
  "https://github.com/user-attachments/assets/",
];

function proxyImageUrls(html: string): string {
  return html.replace(/<img\s+([^>]*?)src="(https:\/\/[^"]+)"([^>]*?)>/g, (_match, before, src, after) => {
    if (GITHUB_IMAGE_HOSTS.some((h) => src.startsWith(h))) {
      return `<img ${before}src="/api/image-proxy?url=${encodeURIComponent(src)}"${after}>`;
    }
    return _match;
  });
}

const renderer = new marked.Renderer();
const originalCode = renderer.code.bind(renderer);
renderer.code = function (token: Parameters<typeof originalCode>[0]) {
  if (token.lang === "mermaid") {
    return `<pre class="mermaid">${escapeHtml(token.text)}</pre>`;
  }
  return originalCode(token);
};
marked.use({ renderer });

mermaid.initialize({ startOnLoad: false, theme: "default" });

type PrComment = {
  author: { login: string };
  body: string;
  createdAt: string;
};

type PrDetailData = {
  number: number;
  title: string;
  body: string;
  files: { path: string; additions: number; deletions: number }[];
  comments: PrComment[];
};

type Props = {
  repo: string;
  prNumber: number;
  onBack: () => void;
  onTitleChange?: (title: string | null) => void;
};

export function PrDetail({ repo, prNumber, onBack, onTitleChange }: Props) {
  const storagePrefix = `gh-chillbox:${repo}:${prNumber}`;
  const [data, setData] = useState<PrDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filesOpen, setFilesOpen] = useState(() => {
    try { return localStorage.getItem(`${storagePrefix}:filesOpen`) !== "false"; } catch { return true; }
  });
  const [bodyOpen, setBodyOpen] = useState(() => {
    try { return localStorage.getItem(`${storagePrefix}:bodyOpen`) !== "false"; } catch { return true; }
  });
  const [commentsOpen, setCommentsOpen] = useState(() => {
    try { return localStorage.getItem(`${storagePrefix}:commentsOpen`) !== "false"; } catch { return true; }
  });
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [quotedText, setQuotedText] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(() => {
    try {
      const raw = localStorage.getItem(`gh-chillbox:chat:${repo}:${prNumber}`);
      return raw ? JSON.parse(raw).length > 0 : false;
    } catch { return false; }
  });
  const [activeTab, setActiveTab] = useState<"chat" | "diff" | "insight">("chat");
  const [insightTab, setInsightTab] = useState<"surface" | "ast" | "callgraph">("surface");
  const [floatingBtn, setFloatingBtn] = useState<{ x: number; y: number; text: string } | null>(null);
  const [mermaidModal, setMermaidModal] = useState<string | null>(null);
  const [modalScale, setModalScale] = useState(1);
  const bodyRef = useRef<HTMLDivElement>(null);
  const commentsRef = useRef<HTMLDivElement>(null);
  const treeWrapRef = useRef<HTMLDivElement>(null);

  const handleFileClick = useCallback((path: string, e: React.MouseEvent) => {
    setQuotedText(null);
    setFloatingBtn(null);
    setSelectedFiles((prev) => {
      const next = new Set(e.metaKey || e.ctrlKey ? prev : []);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const allFilePaths = useMemo(() => data ? data.files.map(f => f.path) : [], [data]);

  const handleSelectAll = useCallback(() => {
    setSelectedFiles(prev => {
      if (prev.size === allFilePaths.length) return new Set();
      return new Set(allFilePaths);
    });
  }, [allFilePaths]);

  const clearSelection = useCallback(() => {
    setSelectedFiles(new Set());
    setQuotedText(null);
    setFloatingBtn(null);
  }, []);

  const handleTextMouseUp = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text) {
      setFloatingBtn(null);
      return;
    }
    const inBody = bodyRef.current?.contains(sel!.anchorNode);
    const inComments = commentsRef.current?.contains(sel!.anchorNode);
    if (!inBody && !inComments) {
      setFloatingBtn(null);
      return;
    }
    const range = sel!.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setFloatingBtn({ x: rect.left + rect.width / 2, y: rect.top - 8, text });
  }, []);

  const handleQuote = useCallback(() => {
    if (!floatingBtn) return;
    setSelectedFiles(new Set());
    setQuotedText(floatingBtn.text);
    setFloatingBtn(null);
    window.getSelection()?.removeAllRanges();
  }, [floatingBtn]);

  useEffect(() => {
    const dismiss = (e: MouseEvent) => {
      if (floatingBtn && !(e.target as HTMLElement).closest(".quote-floating-btn")) {
        setTimeout(() => {
          const sel = window.getSelection()?.toString().trim();
          if (!sel) setFloatingBtn(null);
        }, 0);
      }
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [floatingBtn]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ repo, number: String(prNumber) });
    fetch(`/api/pr-detail?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "取得に失敗しました"))
      .finally(() => setLoading(false));
  }, [repo, prNumber]);

  useEffect(() => {
    if (data?.title) {
      document.title = `${data.title} #${data.number} - ChillBox`;
      onTitleChange?.(`${data.title} #${data.number}`);
    }
    return () => {
      document.title = "gh-chillbox";
      onTitleChange?.(null);
    };
  }, [data?.title, data?.number, onTitleChange]);

  const rawBodyHtml = data?.body ? proxyImageUrls(marked.parse(data.body) as string) : "";
  const [renderedBody, setRenderedBody] = useState("");

  useEffect(() => {
    if (!rawBodyHtml) { setRenderedBody(""); return; }
    let cancelled = false;
    (async () => {
      const div = document.createElement("div");
      div.innerHTML = rawBodyHtml as string;
      const blocks = div.querySelectorAll("pre.mermaid");
      for (let i = 0; i < blocks.length; i++) {
        try {
          const id = `mmd-${prNumber}-${i}-${Date.now()}`;
          const { svg } = await mermaid.render(id, blocks[i].textContent || "");
          blocks[i].innerHTML = svg;
          blocks[i].setAttribute("data-rendered", "true");
        } catch { /* keep raw text on parse error */ }
      }
      if (!cancelled) setRenderedBody(div.innerHTML);
    })();
    return () => { cancelled = true; };
  }, [rawBodyHtml, prNumber]);

  const handleMermaidClick = useCallback((e: React.MouseEvent) => {
    const pre = (e.target as HTMLElement).closest("pre.mermaid[data-rendered]");
    if (pre) {
      setMermaidModal(pre.innerHTML);
      setModalScale(1.5);
    }
  }, []);

  useEffect(() => {
    if (!mermaidModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMermaidModal(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mermaidModal]);

  const handleDiffFileHeaderClick = useCallback((path: string) => {
    if (!filesOpen) {
      setFilesOpen(true);
      try { localStorage.setItem(`${storagePrefix}:filesOpen`, "true"); } catch {}
    }
    requestAnimationFrame(() => {
      const el = treeWrapRef.current?.querySelector(`[data-filepath="${CSS.escape(path)}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [filesOpen, storagePrefix]);

  useEffect(() => {
    if (selectedFiles.size > 0 || quotedText) {
      setChatOpen(true);
      setActiveTab("chat");
    }
  }, [selectedFiles.size, quotedText]);

  const selectedArray = [...selectedFiles];
  const hasChat = chatOpen;

  const SPLIT_STORAGE_KEY = "gh-chillbox:split-ratio";
  const layoutRef = useRef<HTMLDivElement>(null);
  const [splitRatio, setSplitRatio] = useState(() => {
    try {
      const stored = localStorage.getItem(SPLIT_STORAGE_KEY);
      return stored ? parseFloat(stored) : 50;
    } catch { return 50; }
  });
  const draggingRef = useRef(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !layoutRef.current) return;
      const rect = layoutRef.current.getBoundingClientRect();
      const ratio = ((ev.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(20, Math.min(80, ratio));
      setSplitRatio(clamped);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setSplitRatio((r) => {
        try { localStorage.setItem(SPLIT_STORAGE_KEY, String(r)); } catch {}
        return r;
      });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  return (
    <div
      className={`pr-detail-layout${hasChat ? " has-chat" : ""}`}
      ref={layoutRef}
      style={hasChat ? { gridTemplateColumns: `${splitRatio}% 6px 1fr` } : undefined}
    >
      <div className="pr-detail">
        <button type="button" className="pr-detail-back" onClick={onBack}>
          <ArrowLeft size={16} />
          一覧に戻る
        </button>

        {loading && <div className="pr-detail-loading">読み込み中…</div>}
        {error && <div className="error">{error}</div>}

        {data && (
          <>
            <h2 className="pr-detail-title">
              {data.title}{" "}
              <a
                className="pr-detail-number"
                href={`https://github.com/${repo}/pull/${data.number}/changes`}
                target="_blank"
                rel="noopener noreferrer"
              >
                #{data.number}
              </a>
            </h2>

            <div className="pr-detail-section">
              <div className="pr-detail-accordion-row">
                <button
                  type="button"
                  className="pr-detail-accordion"
                  onClick={() => {
                    const next = !filesOpen;
                    setFilesOpen(next);
                    try { localStorage.setItem(`${storagePrefix}:filesOpen`, String(next)); } catch {}
                  }}
                >
                  {filesOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  変更ファイル ({data.files.length})
                  {selectedFiles.size > 0 && (
                    <span className="selected-count">{selectedFiles.size} 選択中</span>
                  )}
                </button>
                <input
                  type="checkbox"
                  className="select-all-checkbox"
                  title="全選択"
                  checked={selectedFiles.size === data.files.length && data.files.length > 0}
                  ref={(el) => {
                    if (el) el.indeterminate = selectedFiles.size > 0 && selectedFiles.size < data.files.length;
                  }}
                  onChange={handleSelectAll}
                />
              </div>
              {filesOpen && (
                <div className="pr-detail-tree-wrap" ref={treeWrapRef}>
                  <FileTree
                    files={data.files}
                    storagePrefix={storagePrefix}
                    selectedFiles={selectedFiles}
                    onFileClick={handleFileClick}
                  />
                </div>
              )}
            </div>

            <div className="pr-detail-section">
              <button
                type="button"
                className="pr-detail-accordion"
                onClick={() => {
                  const next = !bodyOpen;
                  setBodyOpen(next);
                  try { localStorage.setItem(`${storagePrefix}:bodyOpen`, String(next)); } catch {}
                }}
              >
                {bodyOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                本文
              </button>
              {bodyOpen && (
                data.body ? (
                  <div
                    ref={bodyRef}
                    className="pr-detail-body markdown-body"
                    dangerouslySetInnerHTML={{ __html: renderedBody }}
                    onMouseUp={handleTextMouseUp}
                    onClick={handleMermaidClick}
                  />
                ) : (
                  <p className="pr-detail-empty">本文なし</p>
                )
              )}
            </div>

            <div className="pr-detail-section">
              <button
                type="button"
                className="pr-detail-accordion"
                onClick={() => {
                  const next = !commentsOpen;
                  setCommentsOpen(next);
                  try { localStorage.setItem(`${storagePrefix}:commentsOpen`, String(next)); } catch {}
                }}
              >
                {commentsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                コメント ({data.comments.length})
              </button>
              {commentsOpen && (
                data.comments.length > 0 ? (
                  <div ref={commentsRef} className="pr-detail-comments" onMouseUp={handleTextMouseUp}>
                    {data.comments.map((comment, i) => (
                      <div key={i} className="pr-comment">
                        <div className="pr-comment-header">
                          <span className="pr-comment-author">{comment.author.login}</span>
                          <span className="pr-comment-date">{new Date(comment.createdAt).toLocaleString("ja-JP")}</span>
                        </div>
                        <div
                          className="pr-comment-body markdown-body"
                          dangerouslySetInnerHTML={{ __html: proxyImageUrls(marked.parse(comment.body) as string) }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="pr-detail-empty">コメントなし</p>
                )
              )}
            </div>
          </>
        )}
      </div>

      {mermaidModal && (
        <div
          className="mermaid-modal-overlay"
          onClick={() => setMermaidModal(null)}
        >
          <div
            className="mermaid-modal-content"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => {
              if (!e.ctrlKey) return;
              e.preventDefault();
              setModalScale((s) => Math.max(0.2, Math.min(5, s + (e.deltaY > 0 ? -0.1 : 0.1))));
            }}
            style={{ transform: `scale(${modalScale})` }}
            dangerouslySetInnerHTML={{ __html: mermaidModal }}
          />
          <button
            type="button"
            className="mermaid-modal-close"
            onClick={() => setMermaidModal(null)}
          >
            &times;
          </button>
        </div>
      )}

      {floatingBtn && (
        <button
          type="button"
          className="quote-floating-btn"
          style={{ position: "fixed", left: floatingBtn.x, top: floatingBtn.y, transform: "translate(-50%, -100%)" }}
          onClick={handleQuote}
        >
          <MessageSquareQuote size={14} />
          引用して質問
        </button>
      )}

      {hasChat && (
        <div className="split-resizer" onMouseDown={handleResizeStart} />
      )}

      {hasChat && (
        <div className="right-pane">
          <div className="right-pane-tabs">
            <button
              type="button"
              className={`right-pane-tab${activeTab === "chat" ? " active" : ""}`}
              onClick={() => setActiveTab("chat")}
            >
              Chat
            </button>
            <button
              type="button"
              className={`right-pane-tab${activeTab === "diff" ? " active" : ""}`}
              onClick={() => setActiveTab("diff")}
            >
              Diff
            </button>
            <button
              type="button"
              className={`right-pane-tab${activeTab === "insight" ? " active" : ""}`}
              onClick={() => setActiveTab("insight")}
            >
              Insight
            </button>
          </div>
          {activeTab === "chat" ? (
            <ChatPanel
              selectedFiles={selectedArray}
              quotedText={quotedText}
              repo={repo}
              prNumber={prNumber}
              prTitle={data?.title ?? ""}
              prBody={data?.body ?? ""}
              onClearSelection={clearSelection}
              onCloseChat={() => setChatOpen(false)}
            />
          ) : activeTab === "diff" ? (
            <DiffPanel repo={repo} prNumber={prNumber} onFileHeaderClick={handleDiffFileHeaderClick} />
          ) : (
            <div className="insight-panel">
              <div className="insight-sub-tabs">
                <button
                  type="button"
                  className={`insight-sub-tab${insightTab === "surface" ? " active" : ""}`}
                  onClick={() => setInsightTab("surface")}
                >
                  Change Surface
                </button>
                <button
                  type="button"
                  className={`insight-sub-tab${insightTab === "ast" ? " active" : ""}`}
                  onClick={() => setInsightTab("ast")}
                >
                  AST Analysis
                </button>
                <button
                  type="button"
                  className={`insight-sub-tab${insightTab === "callgraph" ? " active" : ""}`}
                  onClick={() => setInsightTab("callgraph")}
                >
                  Call Graph
                </button>
              </div>
              {insightTab === "surface" ? (
                <ChangeSurface files={data?.files ?? []} />
              ) : insightTab === "ast" ? (
                <AstAnalysis repo={repo} prNumber={prNumber} />
              ) : (
                <CallGraph repo={repo} prNumber={prNumber} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
