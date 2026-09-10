import { useState, useEffect, useCallback, useRef } from "react";
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
import { Bell, RotateCcw, Sun, Moon } from "lucide-react";
import type { PR, Filter } from "./types";
import { usePrOrder, useHiddenPrs } from "./useLocalData";
import { useNotifications } from "./useNotifications";
import { ContextMenu } from "./ContextMenu";
import { SortableRow } from "./SortableRow";
import { NotificationDrawer } from "./NotificationDrawer";
import { PrDetail } from "./PrDetail";
import "./App.css";
import headerIcon from "./assets/icon.png";
import headerIconDark from "./assets/icon-dark.png";
import headerLogo from "./assets/logo.png";
import headerLogoDark from "./assets/logo-dark.png";

const REPO_STORAGE_KEY = "gh-chillbox:repo";
const REPO_HISTORY_KEY = "gh-chillbox:repo-history";
const THEME_STORAGE_KEY = "gh-chillbox:theme";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {}
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function loadRepo(): string {
  try {
    return localStorage.getItem(REPO_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function loadRepoHistory(): string[] {
  try {
    const raw = localStorage.getItem(REPO_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRepoHistory(history: string[]) {
  try {
    localStorage.setItem(REPO_HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

export function App() {
  const [prs, setPrs] = useState<PR[]>([]);
  const [filter, setFilter] = useState<Filter>("reviewer-me");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repo, setRepo] = useState(loadRepo);
  const [repoHistory, setRepoHistory] = useState<string[]>(loadRepoHistory);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const repoBarRef = useRef<HTMLFormElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    prNumber: number;
  } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [prTitle, setPrTitle] = useState<string | null>(null);
  const [selectedPr, setSelectedPr] = useState<number | null>(() => {
    if (location.pathname === "/pr-detail") {
      const id = new URLSearchParams(location.search).get("id");
      return id ? parseInt(id, 10) : null;
    }
    return null;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  const navigateToPr = useCallback((prNumber: number) => {
    setSelectedPr(prNumber);
    history.pushState({ pr: prNumber }, "", `/pr-detail?id=${prNumber}`);
  }, []);

  const navigateToList = useCallback(() => {
    setSelectedPr(null);
    history.pushState(null, "", "/");
  }, []);

  useEffect(() => {
    const onPopState = () => {
      if (location.pathname === "/pr-detail") {
        const id = new URLSearchParams(location.search).get("id");
        setSelectedPr(id ? parseInt(id, 10) : null);
      } else {
        setSelectedPr(null);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (repoBarRef.current && !repoBarRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
      const trimmed = repo.trim();
      if (trimmed) {
        setRepoHistory((prev) => {
          const next = [trimmed, ...prev.filter((r) => r !== trimmed)];
          saveRepoHistory(next);
          return next;
        });
      }
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
      <header className="header sticky-header">
        <h1><img src={headerLogo} alt="ChillBox" height={24} className="header-logo header-logo-light" /><img src={headerLogoDark} alt="ChillBox" height={24} className="header-logo header-logo-dark" /><img src={headerIcon} alt="" width={28} height={28} className="header-icon header-icon-light" /><img src={headerIconDark} alt="" width={28} height={28} className="header-icon header-icon-dark" />{prTitle && <span className="header-pr-title">{prTitle}</span>}</h1>
        <div className="header-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
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

      <form className="repo-bar" onSubmit={handleRepoSubmit} ref={repoBarRef}>
        <div className="repo-combo">
          <input
            className="repo-input"
            type="text"
            placeholder="owner/repo（例: yyYank/gh-chillbox）"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            onFocus={() => repoHistory.length > 0 && setDropdownOpen(true)}
          />
          {repoHistory.length > 0 && (
            <button
              type="button"
              className="repo-dropdown-toggle"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              aria-label="履歴を表示"
            >
              ▾
            </button>
          )}
          {dropdownOpen && repoHistory.length > 0 && (
            <ul className="repo-dropdown">
              {repoHistory.map((r) => (
                <li key={r} className="repo-dropdown-item">
                  <button
                    type="button"
                    className="repo-dropdown-select"
                    onClick={() => {
                      setRepo(r);
                      setDropdownOpen(false);
                    }}
                  >
                    {r}
                  </button>
                  <button
                    type="button"
                    className="repo-dropdown-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRepoHistory((prev) => {
                        const next = prev.filter((x) => x !== r);
                        saveRepoHistory(next);
                        return next;
                      });
                    }}
                    title="削除"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </form>

      {selectedPr !== null ? (
        <PrDetail
          repo={repo.trim()}
          prNumber={selectedPr}
          onBack={navigateToList}
          onTitleChange={setPrTitle}
        />
      ) : (
        <>
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
                    {filter !== "hidden" && <th className="col-detail" />}
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
                            onDetail={navigateToPr}
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
                          onDetail={navigateToPr}
                        />
                      ))}
                    </tbody>
                  </SortableContext>
                )}
              </table>
            </DndContext>
          </div>
        </>
      )}

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
