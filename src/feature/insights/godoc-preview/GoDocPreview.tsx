import { useState, useEffect, useRef } from "react";
import { visiblePackages, type GoDocItem, type GoPackage, type Scope, type SymbolChange } from "./godoc-preview";

type Props = {
  repo: string;
  prNumber: number;
};

type LoadState = { loading: boolean; error: string | null; packages: GoPackage[] | null };

const EMPTY: LoadState = { loading: false, error: null, packages: null };

const CHANGE_LABELS: Record<Exclude<SymbolChange, "unchanged">, string> = {
  added: "追加",
  modified: "変更",
  removed: "削除",
};

export function GoDocPreview({ repo, prNumber }: Props) {
  const [scope, setScope] = useState<Scope>("changed");
  const [states, setStates] = useState<Record<Scope, LoadState>>({ changed: EMPTY, all: EMPTY });
  const requested = useRef(new Set<Scope>());

  // 「全部」は切り替えたときに初めて取得する
  useEffect(() => {
    if (requested.current.has(scope)) return;
    requested.current.add(scope);
    setStates((s) => ({ ...s, [scope]: { loading: true, error: null, packages: null } }));
    const params = new URLSearchParams({ repo, number: String(prNumber), scope });
    fetch(`/api/godoc?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setStates((s) => ({ ...s, [scope]: { loading: false, error: null, packages: d.packages ?? [] } }));
      })
      .catch((e) => {
        const error = e instanceof Error ? e.message : "読み込みに失敗しました";
        setStates((s) => ({ ...s, [scope]: { loading: false, error, packages: null } }));
      });
  }, [scope, repo, prNumber]);

  const current = states[scope];
  const packages = current.packages && visiblePackages(current.packages, scope);

  return (
    <div className="api-preview">
      <div className="api-preview-scope">
        {(["changed", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`api-preview-scope-btn${scope === s ? " active" : ""}`}
            onClick={() => setScope(s)}
          >
            {s === "changed" ? "差分" : "全部"}
          </button>
        ))}
      </div>

      {current.loading && <div className="api-preview-empty">読み込み中…</div>}
      {current.error && <div className="error">{current.error}</div>}
      {packages?.length === 0 && (
        <div className="api-preview-empty">
          {scope === "changed" ? "この PR で export されたシンボルの変更はありません" : "Go パッケージが見つかりません"}
        </div>
      )}
      {packages?.map((p) => <PackageView key={`${p.dir}:${p.name}`} pkg={p} />)}
    </div>
  );
}

function ChangeBadge({ change }: { change: SymbolChange }) {
  if (change === "unchanged") return null;
  return <span className={`api-badge change-${change}`}>{CHANGE_LABELS[change]}</span>;
}

function PackageView({ pkg }: { pkg: GoPackage }) {
  return (
    <section className="api-spec">
      <header className="api-spec-header">
        <span className="api-spec-path">{pkg.dir}</span>
        <span className="api-badge">package {pkg.name}</span>
        <ChangeBadge change={pkg.change} />
      </header>
      {/* go/doc の HTML 出力はコメント本文をエスケープ済み */}
      {pkg.docHtml && <div className="godoc-doc" dangerouslySetInnerHTML={{ __html: pkg.docHtml }} />}
      {pkg.items.map((i) => <ItemView key={`${i.kind}:${i.name}`} item={i} />)}
    </section>
  );
}

function ItemView({ item: i }: { item: GoDocItem }) {
  return (
    <div className={`godoc-item change-${i.change}`}>
      <div className="godoc-item-header">
        <span className="godoc-kind">{i.kind}</span>
        <span className={`godoc-name${i.change === "removed" ? " deprecated" : ""}`}>{i.name}</span>
        <ChangeBadge change={i.change} />
        {i.changedParts.length > 0 && (
          <span className="api-changed-parts">変更箇所: {i.changedParts.join(", ")}</span>
        )}
      </div>
      <pre className="godoc-decl">{i.decl}</pre>
      {i.docHtml && <div className="godoc-doc" dangerouslySetInnerHTML={{ __html: i.docHtml }} />}
    </div>
  );
}
