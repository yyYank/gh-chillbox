import { useState, useCallback } from "react";

const ORDER_KEY = "gh-chillbox:pr-order";
const HIDDEN_KEY = "gh-chillbox:pr-hidden";

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

export function usePrOrder() {
  const [order, setOrder] = useState<number[]>(() =>
    loadJson<number[]>(ORDER_KEY, []),
  );

  const reorder = useCallback((newOrder: number[]) => {
    setOrder(newOrder);
    saveJson(ORDER_KEY, newOrder);
  }, []);

  const getRank = useCallback(
    (prNumber: number): number | null => {
      const idx = order.indexOf(prNumber);
      return idx === -1 ? null : idx + 1;
    },
    [order],
  );

  return { order, reorder, getRank };
}

export function useHiddenPrs() {
  const [hidden, setHidden] = useState<Set<number>>(
    () => new Set(loadJson<number[]>(HIDDEN_KEY, [])),
  );

  const hide = useCallback((prNumber: number) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.add(prNumber);
      saveJson(HIDDEN_KEY, [...next]);
      return next;
    });
  }, []);

  const unhide = useCallback((prNumber: number) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.delete(prNumber);
      saveJson(HIDDEN_KEY, [...next]);
      return next;
    });
  }, []);

  const isHidden = useCallback((prNumber: number) => hidden.has(prNumber), [hidden]);

  return { hide, unhide, isHidden, hiddenSet: hidden };
}
