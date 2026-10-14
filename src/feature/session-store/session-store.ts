import { useCallback, useSyncExternalStore } from "react";

// 画面を作り直しても残り、リロードで消える状態の置き場所
// React の外のモジュール変数に持つので、タブ切替や画面移動で破棄されない
const values = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();

export type LoadState<T> = { loading: boolean; error: string | null; data: T | null };

export function getSession<T>(key: string, initial: T): T {
  return values.has(key) ? (values.get(key) as T) : initial;
}

export function setSession<T>(key: string, next: T | ((prev: T | undefined) => T)): void {
  const value =
    typeof next === "function" ? (next as (prev: T | undefined) => T)(values.get(key) as T | undefined) : next;
  values.set(key, value);
  for (const listener of listeners.get(key) ?? []) {
    listener();
  }
}

export function subscribeSession(key: string, listener: () => void): () => void {
  const set = listeners.get(key) ?? new Set();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
  };
}

// 値がないときだけ初期値を入れる（購読者には知らせない）
export function initSession<T>(key: string, init: () => T): void {
  if (!values.has(key)) {
    values.set(key, init());
  }
}

// 同じキーでは1度だけ取得し、結果を LoadState として残す
export function loadSessionOnce<T>(key: string, loader: () => Promise<T>): void {
  if (values.has(key)) {
    return;
  }
  setSession<LoadState<T>>(key, { loading: true, error: null, data: null });
  loader()
    .then((data) => setSession<LoadState<T>>(key, { loading: false, error: null, data }))
    .catch((e) => {
      const error = e instanceof Error ? e.message : "読み込みに失敗しました";
      setSession<LoadState<T>>(key, { loading: false, error, data: null });
    });
}

export function clearSessionStore(): void {
  values.clear();
}

export function useSession<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const value = useSyncExternalStore(
    useCallback((listener: () => void) => subscribeSession(key, listener), [key]),
    () => getSession(key, initial),
  );
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setSession<T>(key, (prev) =>
        typeof next === "function" ? (next as (prev: T) => T)(prev === undefined ? initial : prev) : next,
      ),
    // initial は初回値としてだけ使う
    [key],
  );
  return [value, set];
}
