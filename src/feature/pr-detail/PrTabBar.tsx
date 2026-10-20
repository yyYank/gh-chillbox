import { useState } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MessagesSquare, Send, X } from "lucide-react";
import { tabTooltip } from "./pr-tabs";
import { Tooltip } from "./Tooltip";

type Props = {
  tabs: number[];
  active: number | null;
  titles: Record<number, string>;
  memos: Record<number, string>;
  onSelect: (prNumber: number) => void;
  onClose: (prNumber: number) => void;
  onReorder: (from: number, to: number) => void;
  onBroadcast: (question: string) => Promise<{ sent: number[]; skipped: number[] }>;
};

// 開いている全タブの Chat に同じ質問を送る。会話があるタブは飛ばす
function BroadcastAsk({ onBroadcast }: { onBroadcast: Props["onBroadcast"] }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question) {
      return;
    }
    setSending(true);
    setStatus(null);
    try {
      const { sent, skipped } = await onBroadcast(question);
      setInput("");
      setStatus(`送信 ${sent.length}件 / スキップ ${skipped.length}件`);
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="pr-tab-broadcast-toggle"
        onClick={() => setOpen(true)}
        title="全タブの Chat に同じ質問を送る（会話があるタブは飛ばす）"
      >
        <MessagesSquare size={14} />
      </button>
    );
  }

  return (
    <form className="pr-tab-broadcast" onSubmit={handleSubmit}>
      <input
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="全タブに質問（例: このPRを要約して）"
        disabled={sending}
      />
      <button type="submit" disabled={sending || !input.trim()} title="全タブに送信">
        <Send size={14} />
      </button>
      <button type="button" onClick={() => setOpen(false)} title="閉じる">
        <X size={14} />
      </button>
      {(sending || status) && <span className="pr-tab-broadcast-status">{sending ? "送信中…" : status}</span>}
    </form>
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
