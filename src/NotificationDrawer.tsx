import { useState } from "react";
import { Eraser } from "lucide-react";
import type { AppNotification } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  active: AppNotification[];
  dismissed: AppNotification[];
  onDismiss: (id: string) => void;
};

function formatType(reason: string): string {
  switch (reason) {
    case "mention":
      return "メンション";
    case "review_requested":
      return "レビュー依頼";
    case "assign":
      return "アサイン";
    case "author":
      return "作成者通知";
    case "comment":
      return "コメント";
    default:
      return "通知";
  }
}

function formatMessage(n: AppNotification): string {
  switch (n.type) {
    case "mention":
      if (n.message)
        return `PR#${n.prNumber} ${n.actor ? `@${n.actor}` : ""}: ${n.message}`;
      return `PR#${n.prNumber}であなたがメンションされました`;
    case "review_requested":
      return `あなたがPR#${n.prNumber}のreviewerにアサインされました`;
    case "assign":
      return `あなたがPR#${n.prNumber}にアサインされました`;
    default:
      return `PR#${n.prNumber}: ${n.prTitle}`;
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}日前`;
}

export function NotificationDrawer({
  open,
  onClose,
  active,
  dismissed,
  onDismiss,
}: Props) {
  const [tab, setTab] = useState<"active" | "dismissed">("active");

  const items = tab === "active" ? active : dismissed;

  return (
    <>
      {open && (
        <div className="drawer-overlay" onClick={onClose} role="presentation" />
      )}
      <aside className={`drawer ${open ? "drawer-open" : ""}`}>
        <div className="drawer-header">
          <h2>通知</h2>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="drawer-tabs">
          <button
            type="button"
            className={`drawer-tab ${tab === "active" ? "active" : ""}`}
            onClick={() => setTab("active")}
          >
            通知 ({active.length})
          </button>
          <button
            type="button"
            className={`drawer-tab ${tab === "dismissed" ? "active" : ""}`}
            onClick={() => setTab("dismissed")}
          >
            削除済み ({dismissed.length})
          </button>
        </div>

        <div className="drawer-body">
          {items.length === 0 && (
            <div className="drawer-empty">
              {tab === "dismissed"
                ? "削除済みの通知はありません"
                : "通知はありません"}
            </div>
          )}
          {items.map((n) => (
            <div key={n.id} className="notification-item">
              <div className="notification-content">
                <span className="notification-type-badge">
                  {formatType(n.type)}
                </span>
                <p className="notification-message">
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="notification-link"
                  >
                    {formatMessage(n)}
                  </a>
                </p>
                <span className="notification-time">
                  {formatTime(n.createdAt)}
                </span>
              </div>
              {tab === "active" && (
                <button
                  type="button"
                  className="dismiss-btn"
                  onClick={() => onDismiss(n.id)}
                  title="通知を削除"
                >
                  <Eraser size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
