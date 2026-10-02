import { visiblePackages, type GoDocItem, type GoPackage, type Scope, type SymbolChange } from "./godoc-preview";
import { useScopedFetch } from "../scope-preview/useScopedFetch";
import { ScopeToggle } from "../scope-preview/ScopeToggle";

type Props = {
  repo: string;
  prNumber: number;
};

const CHANGE_LABELS: Record<Exclude<SymbolChange, "unchanged">, string> = {
  added: "追加",
  modified: "変更",
  removed: "削除",
};

export function GoDocPreview({ repo, prNumber }: Props) {
  const current = useScopedFetch<GoPackage>("godoc", "packages", repo, prNumber);
  const scope = current.scope;
  const packages = current.data && visiblePackages(current.data, scope);

  return (
    <div className="api-preview">
      <ScopeToggle scope={scope} onChange={current.setScope} />

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
  if (change === "unchanged") { return null; }
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
