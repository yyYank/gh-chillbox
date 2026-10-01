import { useState, useEffect, useRef } from "react";
import {
  summarize,
  visibleTestFiles,
  type CategorySummary,
  type Scope,
  type TestCaseChange,
  type TestCaseItem,
  type TestCategory,
  type TestFileItem,
} from "./tests-preview";

type Props = {
  repo: string;
  prNumber: number;
};

type LoadState = { loading: boolean; error: string | null; files: TestFileItem[] | null };

const EMPTY: LoadState = { loading: false, error: null, files: null };

const CHANGE_LABELS: Record<Exclude<TestCaseChange, "unchanged">, string> = {
  added: "追加",
  modified: "変更",
  removed: "削除",
};

const CATEGORY_LABELS: Record<TestCategory, string> = { unit: "Unit", e2e: "E2E" };

export function TestsPreview({ repo, prNumber }: Props) {
  const [scope, setScope] = useState<Scope>("changed");
  const [states, setStates] = useState<Record<Scope, LoadState>>({ changed: EMPTY, all: EMPTY });
  const requested = useRef(new Set<Scope>());

  // TODO: 差分/全部の切り替えと遅延取得は ApiPreview・GoDocPreview と同じ作り。共通の部品にする
  // 「全部」は切り替えたときに初めて取得する
  useEffect(() => {
    if (requested.current.has(scope)) return;
    requested.current.add(scope);
    setStates((s) => ({ ...s, [scope]: { loading: true, error: null, files: null } }));
    const params = new URLSearchParams({ repo, number: String(prNumber), scope });
    fetch(`/api/test-cases?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setStates((s) => ({ ...s, [scope]: { loading: false, error: null, files: d.files ?? [] } }));
      })
      .catch((e) => {
        const error = e instanceof Error ? e.message : "読み込みに失敗しました";
        setStates((s) => ({ ...s, [scope]: { loading: false, error, files: null } }));
      });
  }, [scope, repo, prNumber]);

  const current = states[scope];
  const files = current.files && visibleTestFiles(current.files, scope);
  const summary = current.files && summarize(current.files);

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
      {summary && (
        <div className="tests-summary">
          {(["unit", "e2e"] as const).map((c) => <SummaryRow key={c} label={CATEGORY_LABELS[c]} summary={summary[c]} />)}
        </div>
      )}
      {files?.length === 0 && (
        <div className="api-preview-empty">
          {scope === "changed" ? "この PR でテストケースの変更はありません" : "テストファイルが見つかりません"}
        </div>
      )}
      {files && (["unit", "e2e"] as const).map((category) => {
        const inCategory = files.filter((f) => f.category === category);
        if (inCategory.length === 0) return null;
        return (
          <div key={category} className="api-tag-group">
            <div className="api-tag">{CATEGORY_LABELS[category]}</div>
            {inCategory.map((f) => <TestFileView key={f.path} file={f} fullPath={scope === "changed"} />)}
          </div>
        );
      })}
    </div>
  );
}

function SummaryRow({ label, summary }: { label: string; summary: CategorySummary }) {
  return (
    <div className="tests-summary-row">
      <span className="tests-summary-label">{label}</span>
      <span className="api-badge change-added">+{summary.added}</span>
      <span className="api-badge change-modified">~{summary.modified}</span>
      <span className="api-badge change-removed">-{summary.removed}</span>
      <span className="api-muted">全 {summary.total} 件</span>
    </div>
  );
}

function TestFileView({ file, fullPath }: { file: TestFileItem; fullPath: boolean }) {
  return (
    <section className="api-spec">
      <header className="api-spec-header">
        <span className="api-spec-path">{file.path}</span>
        <span className="api-badge">{file.framework}</span>
      </header>
      <ul className="tests-cases">
        {file.cases.map((c, i) => <TestCaseView key={`${c.kind}:${c.names.join("\u0000")}:${i}`} item={c} fullPath={fullPath} />)}
      </ul>
    </section>
  );
}

// 差分モードでは親の describe が隠れることがあるので、名前をパスごと表示する
function TestCaseView({ item: c, fullPath }: { item: TestCaseItem; fullPath: boolean }) {
  const name = fullPath ? c.names.join(" > ") : c.names[c.names.length - 1];
  const indent = fullPath ? 0 : c.names.length - 1;
  return (
    <li className={`tests-case change-${c.change}`} style={{ paddingLeft: `${indent * 16}px` }}>
      <span className="godoc-kind">{c.kind}</span>
      <span className={`tests-case-name${c.change === "removed" ? " deprecated" : ""}${c.dynamic ? " dynamic" : ""}`}>
        {name}
      </span>
      {c.change !== "unchanged" && (
        <span className={`api-badge change-${c.change}`}>{CHANGE_LABELS[c.change]}</span>
      )}
      {c.modifiers.map((m) => <span key={m} className="api-badge">{m}</span>)}
      {c.dynamic && <span className="api-badge" title="名前が実行時に決まります">dynamic</span>}
      <span className="api-muted">L{c.line}</span>
    </li>
  );
}
