import { useEffect } from "react";
import { type LoadState, loadSessionOnce, useSession } from "../../session-store/session-store";

type AstAnalysisResponse<S, R> = { symbols: S[]; relations: R[]; moduleConnections: R[] };

const EMPTY: LoadState<never> = { loading: false, error: null, data: null };

// `/api/ast-analysis` を PR ごとに1度だけ取得し、画面を作り直しても結果を残す
export function useAstAnalysis<S, R>(repo: string, prNumber: number) {
  const sessionKey = `insight:ast-analysis:${repo}:${prNumber}`;
  const [state] = useSession<LoadState<AstAnalysisResponse<S, R>>>(sessionKey, EMPTY);

  useEffect(() => {
    const params = new URLSearchParams({ repo, number: String(prNumber) });
    loadSessionOnce<AstAnalysisResponse<S, R>>(sessionKey, () =>
      fetch(`/api/ast-analysis?${params}`)
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
          return {
            symbols: d.symbols ?? [],
            relations: d.relations ?? [],
            moduleConnections: d.moduleConnections ?? [],
          };
        }),
    );
  }, [sessionKey, repo, prNumber]);

  return {
    loading: state.loading,
    error: state.error,
    symbols: state.data?.symbols ?? [],
    relations: state.data?.relations ?? [],
    moduleConnections: state.data?.moduleConnections ?? [],
  };
}
