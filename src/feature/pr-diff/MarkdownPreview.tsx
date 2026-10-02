import { useState, useEffect, useMemo } from "react";
import { marked } from "marked";
import { ScopeToggle } from "../insights/scope-preview/ScopeToggle";
import type { Scope } from "../insights/scope-preview/useScopedFetch";
import { markdownFromDiff } from "./diff-markdown";
import type { DiffLine } from "./diff-parse";

type Props = {
  repo: string;
  prNumber: number;
  path: string;
  lines: DiffLine[];
  fontSize: number;
};

type FullState = { loading: boolean; error: string | null; content: string | null };

export function MarkdownPreview({ repo, prNumber, path, lines, fontSize }: Props) {
  const [scope, setScope] = useState<Scope>("changed");
  const [full, setFull] = useState<FullState | null>(null);

  const changedHtml = useMemo(() => markdownFromDiff(lines).map((md) => marked.parse(md) as string), [lines]);

  // 「全部」は切り替えたときに初めて取得する
  useEffect(() => {
    if (scope !== "all" || full) {
      return;
    }
    setFull({ loading: true, error: null, content: null });
    const params = new URLSearchParams({ repo, number: String(prNumber), path });
    fetch(`/api/pr-file-content?${params}`)
      .then((res) =>
        res.json().then((d) => {
          if (!res.ok || d.error) {
            throw new Error(d.error ?? `API error: ${res.status}`);
          }
          setFull({ loading: false, error: null, content: d.content });
        }),
      )
      .catch((e) =>
        setFull({ loading: false, error: e instanceof Error ? e.message : "取得に失敗しました", content: null }),
      );
  }, [scope, full, repo, prNumber, path]);

  const fullHtml = useMemo(() => (full?.content != null ? (marked.parse(full.content) as string) : ""), [full]);

  return (
    <div className="diff-md-preview" style={{ fontSize }}>
      <ScopeToggle scope={scope} onChange={setScope} />
      {scope === "changed" ? (
        changedHtml.length === 0 ? (
          <div className="diff-panel-status">変更後の内容がありません</div>
        ) : (
          changedHtml.map((html, i) => (
            <div key={i} className="diff-md-chunk markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
          ))
        )
      ) : full?.loading || !full ? (
        <div className="diff-panel-status">ファイルを読み込み中…</div>
      ) : full.error ? (
        <div className="diff-panel-status diff-panel-error">{full.error}</div>
      ) : (
        <div className="diff-md-chunk markdown-body" dangerouslySetInnerHTML={{ __html: fullHtml }} />
      )}
    </div>
  );
}
