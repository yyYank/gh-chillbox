import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ChevronRight } from "lucide-react";
import type { PR } from "./types";

type Props = {
  pr: PR;
  rank: number | null;
  reviewers: string;
  formatDate: (iso: string) => string;
  onContextMenu: (e: React.MouseEvent) => void;
  onDetail: (prNumber: number) => void;
};

export function SortableRow({ pr, rank, reviewers, formatDate, onContextMenu, onDetail }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: pr.number });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={pr.isDraft ? "draft" : ""}
      onContextMenu={onContextMenu}
    >
      <td className="col-drag" {...attributes} {...listeners}>
        <span className="drag-handle"><GripVertical size={16} /></span>
      </td>
      <td className="col-rank">{rank ?? "—"}</td>
      <td className="col-number">
        <a href={pr.url} target="_blank" rel="noopener noreferrer">
          #{pr.number}
        </a>
      </td>
      <td className="col-title">
        {pr.isDraft && <span className="draft-badge">Draft</span>}
        {pr.title}
      </td>
      <td>{pr.author.login}</td>
      <td>{reviewers}</td>
      <td className="col-date">{formatDate(pr.createdAt)}</td>
      <td className="col-date">{formatDate(pr.updatedAt)}</td>
      <td className="col-detail">
        <button
          type="button"
          className="detail-btn"
          onClick={() => onDetail(pr.number)}
          title="PR詳細"
        >
          <ChevronRight size={16} />
        </button>
      </td>
    </tr>
  );
}
