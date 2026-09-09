import { useState, useRef, useEffect } from "react";
import { Send, X, HelpCircle } from "lucide-react";
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
};

function loadMessages(key: string): Message[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function ChatPanel({ selectedFiles, quotedText, repo, prNumber, prTitle, prBody, onClearSelection }: Props) {
  const storageKey = `gh-chillbox:chat:${repo}:${prNumber}`;
  const [messages, setMessages] = useState<Message[]>(() => loadMessages(storageKey));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(messages)); } catch {}
  }, [messages, storageKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || (selectedFiles.length === 0 && !quotedText)) return;

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
        <span className="chat-panel-title">Chat</span>
        <span className="chat-help-icon" data-tooltip="Chatを実行するとcliでclaude -p接続します">
          <HelpCircle size={14} />
        </span>
      </div>

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
          </>
        )}
      </div>

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
        <input
          className="chat-input"
          type="text"
          placeholder={quotedText ? "引用テキストについて質問…" : selectedFiles.length === 0 ? "ファイルを選択してください" : "質問を入力…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading || (selectedFiles.length === 0 && !quotedText)}
        />
        <button
          type="submit"
          className="chat-send-btn"
          disabled={loading || !input.trim() || (selectedFiles.length === 0 && !quotedText)}
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
