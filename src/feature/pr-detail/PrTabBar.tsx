import { useState } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
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
};

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

export function PrTabBar({ tabs, active, titles, memos, onSelect, onClose, onReorder }: Props) {
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
  );
}
