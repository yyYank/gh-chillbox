import { useEffect } from "react";
import { type LoadState, loadSessionOnce, useSession } from "../../session-store/session-store";

export type Scope = "changed" | "all";

const EMPTY: LoadState<never> = { loading: false, error: null, data: null };

// `/api/<endpoint>?repo&number&scope` を scope ごとに1度だけ取得し、レスポンスの `key` を data として持つ
// 結果と scope の選択は画面を作り直しても残す
export function useScopedFetch<T>(endpoint: string, key: string, repo: string, prNumber: number) {
  const base = `insight:${endpoint}:${repo}:${prNumber}`;
  const [scope, setScope] = useSession<Scope>(`${base}:scope`, "changed");
  const [state] = useSession<LoadState<T[]>>(`${base}:${scope}`, EMPTY);

  // 「全部」は切り替えたときに初めて取得する
  useEffect(() => {
    const params = new URLSearchParams({ repo, number: String(prNumber), scope });
    loadSessionOnce<T[]>(`${base}:${scope}`, () =>
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
          return d[key] ?? [];
        }),
    );
  }, [base, scope, endpoint, key, repo, prNumber]);

  return { scope, setScope, ...state };
}
