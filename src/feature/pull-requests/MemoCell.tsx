import { useState, useRef, useEffect } from "react";

type Props = {
  memo: string;
  onChange: (text: string) => void;
};

// 普段は折り返したテキストで全文を見せ、クリックした時だけ複数行で編集する
export function MemoCell({ memo, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memo);
  const cancelled = useRef(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!editing || !el) { return; }
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const startEdit = () => {
    cancelled.current = false;
    setDraft(memo);
    setEditing(true);
  };

  const finishEdit = () => {
    setEditing(false);
    if (cancelled.current) { return; }
    const next = draft.trim() === "" ? "" : draft;
    if (next !== memo) { onChange(next); }
  };

  return (
    <td className="col-memo" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
      {editing ? (
        <textarea
          ref={editorRef}
          className="memo-editor"
          value={draft}
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={finishEdit}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) { return; }
            if (e.key === "Escape") {
              cancelled.current = true;
              e.currentTarget.blur();
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.currentTarget.blur();
            }
          }}
        />
      ) : (
        <button type="button" className={`memo-view${memo ? "" : " memo-view-empty"}`} onClick={startEdit}>
          {memo || "＋ メモ"}
        </button>
      )}
    </td>
  );
}
