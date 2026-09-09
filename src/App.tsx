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
import type { PR, Filter } from "./types";
import { usePrOrder, useHiddenPrs } from "./useLocalData";
import { ContextMenu } from "./ContextMenu";
import { SortableRow } from "./SortableRow";
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

  const { order, reorder, getRank } = usePrOrder();
  const { hide, isHidden } = useHiddenPrs();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

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
      if (filter === "reviewer-me") params.set("reviewer", "@me");
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
  }, [filter, repo]);

  useEffect(() => {
    fetchPrs();
  }, [fetchPrs]);

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

  const sortedPrs = [...visiblePrs].sort((a, b) => {
    const aIdx = order.indexOf(a.number);
    const bIdx = order.indexOf(b.number);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return b.number - a.number;
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentIds = sortedPrs.map((pr) => pr.number);
    const oldIndex = currentIds.indexOf(active.id as number);
    const newIndex = currentIds.indexOf(over.id as number);
    if (oldIndex === -1 || newIndex === -1) return;

    const newIds = [...currentIds];
    newIds.splice(oldIndex, 1);
    newIds.splice(newIndex, 0, active.id as number);
    reorder(newIds);
  };

  const reviewers = (pr: PR) =>
    pr.reviewRequests.map((r) => r.login).join(", ") || "—";

  return (
    <div className="app">
      <header className="header">
        <h1>PR管理</h1>
        <button
          type="button"
          className="refresh-btn"
          onClick={fetchPrs}
          disabled={loading}
        >
          {loading ? "取得中…" : "更新"}
        </button>
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
                <th className="col-drag" />
                <th className="col-rank">優先度</th>
                <th>PR</th>
                <th>タイトル</th>
                <th>Author</th>
                <th>Reviewer</th>
              </tr>
            </thead>
            <SortableContext
              items={sortedPrs.map((pr) => pr.number)}
              strategy={verticalListSortingStrategy}
            >
              <tbody>
                {sortedPrs.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="empty">
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
    </div>
  );
}
