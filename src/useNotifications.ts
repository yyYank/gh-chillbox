import { useState, useCallback } from "react";
import type { AppNotification } from "./types";

const NOTIFICATIONS_KEY = "gh-chillbox:notifications";
const DISMISSED_KEY = "gh-chillbox:notifications-dismissed";
const READ_KEY = "gh-chillbox:notifications-read";

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable
  }
}

export function useNotifications(repo: string) {
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    loadJson<AppNotification[]>(NOTIFICATIONS_KEY, []),
  );
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(
    () => new Set(loadJson<string[]>(DISMISSED_KEY, [])),
  );
  const [readIds, setReadIds] = useState<Set<string>>(
    () => new Set(loadJson<string[]>(READ_KEY, [])),
  );
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!repo.trim()) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ repo: repo.trim() });
      const res = await fetch(`/api/notifications?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.error) return;

      setNotifications((prev) => {
        const existing = new Map(prev.map((n) => [n.id, n]));
        for (const n of data as AppNotification[]) {
          existing.set(n.id, n);
        }
        const merged = [...existing.values()].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        saveJson(NOTIFICATIONS_KEY, merged);
        return merged;
      });
    } catch {
      // ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, [repo]);

  const dismiss = useCallback((id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveJson(DISMISSED_KEY, [...next]);
      return next;
    });
  }, []);

  const dismissClosed = useCallback(() => {
    const closedIds = notifications
      .filter((n) => !dismissedIds.has(n.id) && (n.prState === "closed" || n.prState === "merged"))
      .map((n) => n.id);
    if (closedIds.length === 0) return;
    setDismissedIds((prev) => {
      const next = new Set(prev);
      for (const id of closedIds) next.add(id);
      saveJson(DISMISSED_KEY, [...next]);
      return next;
    });
  }, [notifications, dismissedIds]);

  const markRead = useCallback((id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveJson(READ_KEY, [...next]);
      return next;
    });
  }, []);

  const active = notifications.filter((n) => !dismissedIds.has(n.id));
  const dismissed = notifications.filter((n) => dismissedIds.has(n.id));
  const unreadCount = active.filter((n) => !readIds.has(n.id)).length;

  return {
    active,
    dismissed,
    unreadCount,
    fetchNotifications,
    dismiss,
    dismissClosed,
    markRead,
    readIds,
    loading,
  };
}
