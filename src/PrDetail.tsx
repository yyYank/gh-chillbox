import { useState, useEffect, useCallback, useRef } from "react";
import { marked } from "marked";
import { ArrowLeft, ChevronDown, ChevronRight, MessageSquareQuote } from "lucide-react";
import { FileTree } from "./FileTree";
import { ChatPanel } from "./ChatPanel";

marked.setOptions({ gfm: true, breaks: true });

type PrDetailData = {
  number: number;
  title: string;
  body: string;
  files: { path: string; additions: number; deletions: number }[];
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
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [quotedText, setQuotedText] = useState<string | null>(null);
  const [floatingBtn, setFloatingBtn] = useState<{ x: number; y: number; text: string } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

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

  const handleBodyMouseUp = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text || !bodyRef.current) {
      setFloatingBtn(null);
      return;
    }
    if (!bodyRef.current.contains(sel!.anchorNode)) {
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

  const bodyHtml = data?.body ? marked.parse(data.body) : "";

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
                    dangerouslySetInnerHTML={{ __html: bodyHtml as string }}
                    onMouseUp={handleBodyMouseUp}
                  />
                ) : (
                  <p className="pr-detail-empty">本文なし</p>
                )
              )}
            </div>
          </>
        )}
      </div>

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
