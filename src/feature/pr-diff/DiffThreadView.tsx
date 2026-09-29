import { useState } from "react";
import { Send, Trash2, X } from "lucide-react";
import { marked } from "marked";
import type { ThreadAnchor, ThreadMessage } from "./diff-threads";

type Props = {
  anchor: ThreadAnchor;
  messages: ThreadMessage[];
  repo: string;
  prNumber: number;
  prTitle: string;
  prBody: string;
  onAppend: (anchor: ThreadAnchor, msg: ThreadMessage) => void;
  onDelete: (key: string) => void;
  onCancel: () => void;
};

export function DiffThreadView({ anchor, messages, repo, prNumber, prTitle, prBody, onAppend, onDelete, onCancel }: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const isNew = messages.length === 0;
  const range = anchor.start === anchor.end ? anchor.start : `${anchor.start}〜${anchor.end}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question) return;

    onAppend(anchor, { role: "user", content: question });
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, prNumber, question, prTitle, prBody, diffThread: anchor }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      onAppend(anchor, { role: "assistant", content: data.answer });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "エラーが発生しました";
      onAppend(anchor, { role: "assistant", content: `エラー: ${msg}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="diff-thread">
      <div className="diff-thread-header">
        <span className="diff-thread-range">{range}</span>
        {isNew ? (
          <button type="button" className="diff-thread-icon-btn" title="キャンセル" onClick={onCancel}>
            <X size={14} />
          </button>
        ) : (
          <button
            type="button"
            className="diff-thread-icon-btn"
            title="スレッドを削除"
            disabled={loading}
            onClick={() => onDelete(anchor.key)}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
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
      <form className="diff-thread-input-area" onSubmit={handleSubmit}>
        <textarea
          className="chat-input"
          placeholder={isNew ? "この行について質問…" : "返信…"}
          value={input}
          autoFocus={isNew}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          disabled={loading}
          rows={2}
        />
        <button type="submit" className="chat-send-btn" disabled={loading || !input.trim()}>
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
