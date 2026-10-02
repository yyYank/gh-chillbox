import { useState, useEffect, useRef } from "react";

export type Scope = "changed" | "all";

type LoadState<T> = { loading: boolean; error: string | null; data: T[] | null };

const EMPTY: LoadState<never> = { loading: false, error: null, data: null };

// `/api/<endpoint>?repo&number&scope` を scope ごとに1度だけ取得し、レスポンスの `key` を data として持つ
export function useScopedFetch<T>(endpoint: string, key: string, repo: string, prNumber: number) {
  const [scope, setScope] = useState<Scope>("changed");
  const [states, setStates] = useState<Record<Scope, LoadState<T>>>({ changed: EMPTY, all: EMPTY });
  const requested = useRef(new Set<Scope>());

  // 「全部」は切り替えたときに初めて取得する
  useEffect(() => {
    if (requested.current.has(scope)) {
      return;
    }
    requested.current.add(scope);
    setStates((s) => ({ ...s, [scope]: { loading: true, error: null, data: null } }));
    const params = new URLSearchParams({ repo, number: String(prNumber), scope });
    fetch(`/api/${endpoint}?${params}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }
        return res.json();
      })
      .then((d) => {
        if (d.error) {
          throw new Error(d.error);
        }
        setStates((s) => ({ ...s, [scope]: { loading: false, error: null, data: d[key] ?? [] } }));
      })
      .catch((e) => {
        const error = e instanceof Error ? e.message : "読み込みに失敗しました";
        setStates((s) => ({ ...s, [scope]: { loading: false, error, data: null } }));
      });
  }, [scope, endpoint, key, repo, prNumber]);

  return { scope, setScope, ...states[scope] };
}
