import { useState } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MessagesSquare, Send, X } from "lucide-react";
import { tabTooltip } from "./pr-tabs";
import { Tooltip } from "./Tooltip";
import { BroadcastPresets } from "../chat/BroadcastPresets";

type Props = {
  tabs: number[];
  active: number | null;
  titles: Record<number, string>;
  memos: Record<number, string>;
  onSelect: (prNumber: number) => void;
  onClose: (prNumber: number) => void;
  onReorder: (from: number, to: number) => void;
  onBroadcast: (
    question: string,
    options: { skipWithHistory: boolean; skipApproved: boolean },
  ) => Promise<{ sent: number[]; skipped: number[] }>;
};

// 開いている全タブの Chat に同じ質問を送る。会話があるタブを飛ばすかは選べる
function BroadcastAsk({ onBroadcast }: { onBroadcast: Props["onBroadcast"] }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [skipWithHistory, setSkipWithHistory] = useState(false);
  const [skipApproved, setSkipApproved] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const submit = async () => {
    const question = input.trim();
    if (!question) {
      return;
    }
    // 返事を待つ間も操作できるよう、送ったらすぐ閉じて結果はボタンの横に出す
    setOpen(false);
    setInput("");
    setSending(true);
    setStatus(null);
    try {
      const { sent, skipped } = await onBroadcast(question, { skipWithHistory, skipApproved });
      setStatus(`送信 ${sent.length}件 / スキップ ${skipped.length}件`);
    } catch (err) {
      // approve 状態を取得できなかったときは、どのタブにも送らずに止める
      setStatus(`送信できませんでした: ${err instanceof Error ? err.message : "エラー"}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="pr-tab-broadcast">
      {(sending || status) && <span className="pr-tab-broadcast-status">{sending ? "送信中…" : status}</span>}
      <button
        type="button"
        className="pr-tab-broadcast-toggle"
        onClick={() => setOpen(true)}
        title="全タブの Chat に同じ質問を送る"
      >
        <MessagesSquare size={14} />
      </button>
      {open && (
        <div className="chat-preview-overlay" onClick={() => setOpen(false)}>
          <form
            className="chat-preview-modal pr-broadcast-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          >
            <div className="chat-preview-header">
              <span>全タブに質問</span>
              <button type="button" className="chat-preview-close" onClick={() => setOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="pr-broadcast-body">
              <BroadcastPresets input={input} onPick={setInput} />
              <textarea
                autoFocus
                rows={4}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="例: このPRを要約して"
              />
              <label className="pr-broadcast-skip">
                <input
                  type="checkbox"
                  checked={skipWithHistory}
                  onChange={(e) => setSkipWithHistory(e.target.checked)}
                />
                チャット履歴があるタブはスキップ
              </label>
              <label className="pr-broadcast-skip">
                <input type="checkbox" checked={skipApproved} onChange={(e) => setSkipApproved(e.target.checked)} />
                approve済みのタブはスキップ
              </label>
            </div>
            <div className="pr-broadcast-footer">
              <button type="submit" className="pr-broadcast-send" disabled={!input.trim()}>
                <Send size={14} />
                送信
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function SortableTab({
  prNumber,
  active,
  title,
  memo,
  dragging,
  onSelect,
  onClose,
}: {
  prNumber: number;
  active: boolean;
  title?: string;
  memo?: string;
  dragging: boolean;
  onSelect: (prNumber: number) => void;
  onClose: (prNumber: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: prNumber });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`pr-tab${active ? " active" : ""}`}
      {...attributes}
      {...listeners}
      role="presentation"
    >
      <Tooltip className="pr-tab-inner" content={tabTooltip(title, memo)} disabled={dragging}>
        <button
          type="button"
          className="pr-tab-label"
          role="tab"
          aria-selected={active}
          onClick={() => onSelect(prNumber)}
        >
          <span className="pr-tab-number">#{prNumber}</span>
          {title && <span className="pr-tab-title">{title}</span>}
        </button>
        <button type="button" className="pr-tab-close" onClick={() => onClose(prNumber)} title="タブを閉じる">
          <X size={12} />
        </button>
      </Tooltip>
    </div>
  );
}

export function PrTabBar({ tabs, active, titles, memos, onSelect, onClose, onReorder, onBroadcast }: Props) {
  // 5px 以上動かしたときだけドラッグにして、クリックでのタブ切り替えを妨げない
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [dragging, setDragging] = useState(false);

  const handleDragEnd = (event: DragEndEvent) => {
    setDragging(false);
    const { active: dragActive, over } = event;
    if (over && dragActive.id !== over.id) {
      onReorder(Number(dragActive.id), Number(over.id));
    }
  };

  return (
    <div className="pr-tab-row">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => setDragging(true)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragging(false)}
      >
        <SortableContext items={tabs} strategy={horizontalListSortingStrategy}>
          <div className="pr-tab-bar" role="tablist">
            {tabs.map((n) => (
              <SortableTab
                key={n}
                prNumber={n}
                active={n === active}
                title={titles[n]}
                memo={memos[n]}
                dragging={dragging}
                onSelect={onSelect}
                onClose={onClose}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <BroadcastAsk onBroadcast={onBroadcast} />
    </div>
  );
}
