import { useState, useRef, useEffect, useCallback } from "react";
import { Send, X, HelpCircle, RotateCcw, AlertTriangle, Eye } from "lucide-react";
import { marked } from "marked";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Props = {
  selectedFiles: string[];
  quotedText: string | null;
  repo: string;
  prNumber: number;
  prTitle: string;
  prBody: string;
  onClearSelection: () => void;
  onCloseChat: () => void;
};

function loadMessages(key: string): Message[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function ChatPanel({ selectedFiles, quotedText, repo, prNumber, prTitle, prBody, onClearSelection, onCloseChat }: Props) {
  const storageKey = `gh-chillbox:chat:${repo}:${prNumber}`;
  const [messages, setMessages] = useState<Message[]>(() => loadMessages(storageKey));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [includeDiff, setIncludeDiff] = useState(false);
  const [diffCharCount, setDiffCharCount] = useState<number | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const fetchDiffSize = useCallback(async (files: string[]) => {
    if (files.length === 0) { setDiffCharCount(null); return; }
    setDiffLoading(true);
    try {
      const params = new URLSearchParams({ repo, number: String(prNumber), files: files.join(",") });
      const res = await fetch(`/api/pr-diff?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDiffCharCount(data.charCount ?? null);
    } catch {
      setDiffCharCount(null);
    } finally {
      setDiffLoading(false);
    }
  }, [repo, prNumber]);

  useEffect(() => {
    if (includeDiff && selectedFiles.length > 0) {
      fetchDiffSize(selectedFiles);
    } else {
      setDiffCharCount(null);
    }
  }, [includeDiff, selectedFiles, fetchDiffSize]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(messages)); } catch {}
  }, [messages, storageKey]);

  const handlePreview = async () => {
    const question = input.trim();
    if (!question) return;

    setPreviewLoading(true);
    try {
      const payload: Record<string, unknown> = { repo, prNumber, question, prTitle, prBody };
      if (quotedText) {
        payload.quotedText = quotedText;
      } else {
        payload.files = selectedFiles;
        if (includeDiff) payload.includeDiff = true;
      }
      const res = await fetch("/api/chat/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      const label = data.resumed ? "(セッション継続中)\n\n" : "";
      setPreviewContent(label + data.prompt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "エラーが発生しました";
      setPreviewContent(`エラー: ${msg}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question) return;

    const userMsg: Message = { role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const payload: Record<string, unknown> = { repo, prNumber, question, prTitle, prBody };
      if (quotedText) {
        payload.quotedText = quotedText;
      } else {
        payload.files = selectedFiles;
        if (includeDiff) payload.includeDiff = true;
      }
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "エラーが発生しました";
      setMessages((prev) => [...prev, { role: "assistant", content: `エラー: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-panel-header">
        <span className="chat-help-icon" data-tooltip="Chatを実行するとcliでclaude -p接続します">
          <HelpCircle size={14} />
        </span>
        <button
          type="button"
          className="chat-reset-btn"
          title="セッションをリセット"
          disabled={loading || messages.length === 0}
          onClick={async () => {
            setMessages([]);
            try { localStorage.removeItem(storageKey); } catch {}
            try {
              await fetch("/api/chat/session", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ repo, prNumber }),
              });
            } catch {}
            onCloseChat();
          }}
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {(quotedText || selectedFiles.length > 0) && (
        <div className="chat-selected-files">
          {quotedText ? (
            <>
              <span className="chat-selected-label">引用テキスト</span>
              <button type="button" className="chat-clear-btn" onClick={onClearSelection} title="引用解除">
                <X size={14} />
              </button>
              <blockquote className="chat-quoted-text">{quotedText}</blockquote>
            </>
          ) : (
            <>
              <span className="chat-selected-label">選択中のファイル ({selectedFiles.length})</span>
              <button type="button" className="chat-clear-btn" onClick={onClearSelection} title="選択解除">
                <X size={14} />
              </button>
              <ul className="chat-file-list">
                {selectedFiles.map((f) => (
                  <li key={f} className="chat-file-item">{f}</li>
                ))}
              </ul>
              <label className="chat-diff-toggle">
                <input type="checkbox" checked={includeDiff} onChange={(e) => setIncludeDiff(e.target.checked)} />
                PR diffを含める
                {diffLoading && <span className="chat-diff-loading">取得中…</span>}
              </label>
              {includeDiff && diffCharCount !== null && diffCharCount > 15000 && (
                <div className={`chat-diff-warning ${diffCharCount > 50000 ? "chat-diff-warning-red" : "chat-diff-warning-yellow"}`}>
                  <AlertTriangle size={14} />
                  {diffCharCount > 50000
                    ? `diff が ${Math.round(diffCharCount / 1000)}k文字あります。分割を検討してください`
                    : `diff が ${Math.round(diffCharCount / 1000)}k文字あります。指示が埋もれる可能性があります`}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="chat-body" ref={bodyRef}>
        {messages.length === 0 && (
          <div className="chat-empty">ファイルを選択して質問を入力してください</div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message chat-message-${msg.role}`}>
            <div className="chat-message-label">{msg.role === "user" ? "You" : "Claude"}</div>
            {msg.role === "assistant" ? (
              <div
                className="chat-message-content markdown-body"
                dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) as string }}
              />
            ) : (
              <div className="chat-message-content">{msg.content}</div>
            )}
          </div>
        ))}
        {loading && (
          <div className="chat-message chat-message-assistant">
            <div className="chat-message-label">Claude</div>
            <div className="chat-message-content chat-loading">考え中…</div>
          </div>
        )}
      </div>

      <form className="chat-input-area" onSubmit={handleSubmit}>
        <textarea
          className="chat-input"
          placeholder={quotedText ? "引用テキストについて質問…" : selectedFiles.length > 0 ? "選択ファイルについて質問…" : "質問を入力…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          disabled={loading}
          rows={3}
        />
        <button
          type="button"
          className="chat-preview-btn"
          title="送信されるプロンプトをプレビュー"
          disabled={loading || previewLoading || !input.trim()}
          onClick={handlePreview}
        >
          <Eye size={16} />
        </button>
        <button
          type="submit"
          className="chat-send-btn"
          disabled={loading || !input.trim()}
        >
          <Send size={16} />
        </button>
      </form>

      {previewContent !== null && (
        <div className="chat-preview-overlay" onClick={() => setPreviewContent(null)}>
          <div className="chat-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="chat-preview-header">
              <span>プロンプト プレビュー</span>
              <button type="button" className="chat-preview-close" onClick={() => setPreviewContent(null)}>
                <X size={16} />
              </button>
            </div>
            <pre className="chat-preview-body">{previewContent}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
