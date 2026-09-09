import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Bell, RotateCcw } from "lucide-react";
import type { PR, Filter } from "./types";
import { usePrOrder, useHiddenPrs } from "./useLocalData";
import { useNotifications } from "./useNotifications";
import { ContextMenu } from "./ContextMenu";
import { SortableRow } from "./SortableRow";
import { NotificationDrawer } from "./NotificationDrawer";
import "./App.css";

const REPO_STORAGE_KEY = "gh-chillbox:repo";

function loadRepo(): string {
  try {
    return localStorage.getItem(REPO_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function App() {
  const [prs, setPrs] = useState<PR[]>([]);
  const [filter, setFilter] = useState<Filter>("reviewer-me");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repo, setRepo] = useState(loadRepo);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    prNumber: number;
  } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { order, reorder, getRank } = usePrOrder();
  const { hide, unhide, isHidden, hiddenSet } = useHiddenPrs();
  const { active, dismissed, unreadCount, fetchNotifications, dismiss, markRead, readIds } =
    useNotifications(repo);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const apiMode = filter === "reviewer-me" ? "reviewer-me" : "open";

  const fetchPrs = useCallback(async () => {
    if (!repo.trim()) {
      setPrs([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("repo", repo.trim());
      if (apiMode === "reviewer-me") params.set("reviewer", "@me");
      const res = await fetch(`/api/prs?${params}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPrs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [apiMode, repo]);

  useEffect(() => {
    fetchPrs();
    fetchNotifications();
  }, [fetchPrs, fetchNotifications]);

  useEffect(() => {
    try {
      localStorage.setItem(REPO_STORAGE_KEY, repo.trim());
    } catch {
      // ignore
    }
  }, [repo]);

  const handleRepoSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    fetchPrs();
  };

  const visiblePrs = prs.filter((pr) => !isHidden(pr.number));
  const hiddenPrs = prs.filter((pr) => isHidden(pr.number));

  const sortedPrs = [...visiblePrs].sort((a, b) => {
    const aIdx = order.indexOf(a.number);
    const bIdx = order.indexOf(b.number);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return b.number - a.number;
  });

  const groupedByAuthor = (() => {
    if (filter !== "group-by-author") return [];
    const groups = new Map<string, PR[]>();
    for (const pr of sortedPrs) {
      const author = pr.author.login;
      if (!groups.has(author)) groups.set(author, []);
      groups.get(author)!.push(pr);
    }
    return [...groups.entries()];
  })();

  const handleDragEnd = (event: DragEndEvent) => {
    const { active: dragActive, over } = event;
    if (!over || dragActive.id === over.id) return;

    if (filter === "group-by-author") {
      const activePr = sortedPrs.find((pr) => pr.number === dragActive.id);
      const overPr = sortedPrs.find((pr) => pr.number === over.id);
      if (!activePr || !overPr || activePr.author.login !== overPr.author.login)
        return;

      const groupIds = sortedPrs
        .filter((pr) => pr.author.login === activePr.author.login)
        .map((pr) => pr.number);
      const oldIndex = groupIds.indexOf(dragActive.id as number);
      const newIndex = groupIds.indexOf(over.id as number);
      if (oldIndex === -1 || newIndex === -1) return;

      const newGroupIds = [...groupIds];
      newGroupIds.splice(oldIndex, 1);
      newGroupIds.splice(newIndex, 0, dragActive.id as number);

      const fullIds = sortedPrs.map((pr) => pr.number);
      const groupIdSet = new Set(groupIds);
      let gi = 0;
      const result = fullIds.map((id) =>
        groupIdSet.has(id) ? newGroupIds[gi++] : id,
      );
      reorder(result);
    } else {
      const currentIds = sortedPrs.map((pr) => pr.number);
      const oldIndex = currentIds.indexOf(dragActive.id as number);
      const newIndex = currentIds.indexOf(over.id as number);
      if (oldIndex === -1 || newIndex === -1) return;

      const newIds = [...currentIds];
      newIds.splice(oldIndex, 1);
      newIds.splice(newIndex, 0, dragActive.id as number);
      reorder(newIds);
    }
  };

  const reviewers = (pr: PR) =>
    pr.reviewRequests.map((r) => r.login).join(", ") || "—";

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="app">
      <header className="header">
        <h1>PR管理</h1>
        <div className="header-actions">
          <button
            type="button"
            className="notification-bell"
            onClick={() => setDrawerOpen(true)}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount}</span>
            )}
          </button>
          <button
            type="button"
            className="refresh-btn"
            onClick={() => {
              fetchPrs();
              fetchNotifications();
            }}
            disabled={loading}
          >
            {loading ? "取得中…" : "更新"}
          </button>
        </div>
      </header>

      <form className="repo-bar" onSubmit={handleRepoSubmit}>
        <input
          className="repo-input"
          type="text"
          placeholder="owner/repo（例: yyYank/gh-chillbox）"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
        />
      </form>

      <div className="filter-bar">
        <button
          type="button"
          className={`filter-btn ${filter === "open" ? "active" : ""}`}
          onClick={() => setFilter("open")}
        >
          Open PR
        </button>
        <button
          type="button"
          className={`filter-btn ${filter === "reviewer-me" ? "active" : ""}`}
          onClick={() => setFilter("reviewer-me")}
        >
          Open PR &amp; Reviewer @me
        </button>
        <button
          type="button"
          className={`filter-btn ${filter === "group-by-author" ? "active" : ""}`}
          onClick={() => setFilter("group-by-author")}
        >
          Author別
        </button>
        {hiddenSet.size > 0 && (
          <button
            type="button"
            className={`filter-btn ${filter === "hidden" ? "active" : ""}`}
            onClick={() => setFilter("hidden")}
          >
            非表示PR ({hiddenSet.size})
          </button>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="table-wrap">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <table className="pr-table">
            <thead>
              <tr>
                {filter !== "hidden" && <th className="col-drag" />}
                {filter !== "hidden" && <th className="col-rank">優先度</th>}
                <th>PR</th>
                <th>タイトル</th>
                <th>Author</th>
                <th>Reviewer</th>
                <th>作成日時</th>
                <th>更新日時</th>
                {filter === "hidden" && <th />}
              </tr>
            </thead>

            {filter === "hidden" ? (
              <tbody>
                {hiddenPrs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty">
                      非表示のPRはありません
                    </td>
                  </tr>
                )}
                {hiddenPrs.map((pr) => (
                  <tr key={pr.number}>
                    <td className="col-number">
                      <a
                        href={pr.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        #{pr.number}
                      </a>
                    </td>
                    <td className="col-title">
                      {pr.isDraft && (
                        <span className="draft-badge">Draft</span>
                      )}
                      {pr.title}
                    </td>
                    <td>{pr.author.login}</td>
                    <td>{reviewers(pr)}</td>
                    <td className="col-date">{formatDate(pr.createdAt)}</td>
                    <td className="col-date">{formatDate(pr.updatedAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="unhide-btn"
                        onClick={() => unhide(pr.number)}
                        title="再表示"
                      >
                        <RotateCcw size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            ) : filter === "group-by-author" ? (
              groupedByAuthor.map(([author, groupPrs]) => (
                <SortableContext
                  key={author}
                  items={groupPrs.map((pr) => pr.number)}
                  strategy={verticalListSortingStrategy}
                >
                  <tbody>
                    <tr className="group-header-row">
                      <td colSpan={8}>{author}</td>
                    </tr>
                    {groupPrs.map((pr, idx) => (
                      <SortableRow
                        key={pr.number}
                        pr={pr}
                        rank={idx + 1}
                        reviewers={reviewers(pr)}
                        formatDate={formatDate}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            prNumber: pr.number,
                          });
                        }}
                      />
                    ))}
                  </tbody>
                </SortableContext>
              ))
            ) : (
              <SortableContext
                items={sortedPrs.map((pr) => pr.number)}
                strategy={verticalListSortingStrategy}
              >
                <tbody>
                  {sortedPrs.length === 0 && !loading && (
                    <tr>
                      <td colSpan={8} className="empty">
                        {repo.trim()
                          ? "該当するPRがありません"
                          : "リポジトリを入力してください"}
                      </td>
                    </tr>
                  )}
                  {sortedPrs.map((pr) => (
                    <SortableRow
                      key={pr.number}
                      pr={pr}
                      rank={getRank(pr.number)}
                      reviewers={reviewers(pr)}
                      formatDate={formatDate}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          prNumber: pr.number,
                        });
                      }}
                    />
                  ))}
                </tbody>
              </SortableContext>
            )}
          </table>
        </DndContext>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onHide={() => {
            hide(contextMenu.prNumber);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      <NotificationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        active={active}
        dismissed={dismissed}
        readIds={readIds}
        onDismiss={dismiss}
        onMarkRead={markRead}
      />
    </div>
  );
}
