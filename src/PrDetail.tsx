import { useState, useEffect, useCallback, useRef } from "react";
import { marked } from "marked";
import mermaid from "mermaid";
import { ArrowLeft, ChevronDown, ChevronRight, MessageSquareQuote } from "lucide-react";
import { FileTree } from "./FileTree";
import { ChatPanel } from "./ChatPanel";

marked.setOptions({ gfm: true, breaks: true });

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
};

export function PrDetail({ repo, prNumber, onBack }: Props) {
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
  const [floatingBtn, setFloatingBtn] = useState<{ x: number; y: number; text: string } | null>(null);
  const [mermaidModal, setMermaidModal] = useState<string | null>(null);
  const [modalScale, setModalScale] = useState(1);
  const bodyRef = useRef<HTMLDivElement>(null);
  const commentsRef = useRef<HTMLDivElement>(null);

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

  const rawBodyHtml = data?.body ? marked.parse(data.body) : "";
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

  const selectedArray = [...selectedFiles];
  const hasChat = selectedFiles.size > 0 || !!quotedText;

  return (
    <div className={`pr-detail-layout${hasChat ? " has-chat" : ""}`}>
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
                href={`https://github.com/${repo}/pull/${data.number}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                #{data.number}
              </a>
            </h2>

            <div className="pr-detail-section">
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
              {filesOpen && (
                <div className="pr-detail-tree-wrap">
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
                          dangerouslySetInnerHTML={{ __html: marked.parse(comment.body) as string }}
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

      {(selectedFiles.size > 0 || quotedText) && (
        <ChatPanel
          selectedFiles={selectedArray}
          quotedText={quotedText}
          repo={repo}
          prNumber={prNumber}
          prTitle={data?.title ?? ""}
          prBody={data?.body ?? ""}
          onClearSelection={clearSelection}
        />
      )}
    </div>
  );
}
