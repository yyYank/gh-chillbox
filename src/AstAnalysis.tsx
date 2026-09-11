import { useState, useEffect } from "react";

type SymbolKind =
  | "function"
  | "method"
  | "class"
  | "component"
  | "hook"
  | "interface"
  | "type"
  | "struct"
  | "unknown";

type ChangedSymbol = {
  id: string;
  name: string;
  kind: SymbolKind;
  file: string;
  startLine: number;
  endLine: number;
  changedLines: number[];
};

type SymbolRelation = {
  from: string;
  to: string;
  kind: "call" | "component-use" | "hook-use" | "method-call";
};

const KIND_LABELS: Record<SymbolKind, string> = {
  function: "Function",
  method: "Method",
  class: "Class",
  component: "Component",
  hook: "Hook",
  interface: "Interface",
  type: "Type",
  struct: "Struct",
  unknown: "Unknown",
};

const KIND_COLORS: Record<SymbolKind, string> = {
  function: "#a78bfa",
  method: "#38bdf8",
  class: "#fbbf24",
  component: "#34d399",
  hook: "#f472b6",
  interface: "#67e8f9",
  type: "#94a3b8",
  struct: "#fb923c",
  unknown: "#6b7280",
};

const RELATION_LABELS: Record<SymbolRelation["kind"], string> = {
  call: "calls",
  "component-use": "renders",
  "hook-use": "uses",
  "method-call": "calls",
};

type Props = {
  repo: string;
  prNumber: number;
};

function buildFlowChains(
  symbols: ChangedSymbol[],
  relations: SymbolRelation[],
): string[][] {
  const symbolNames = new Set(symbols.map((s) => s.name));
  const relevant = relations.filter(
    (r) => symbolNames.has(r.from) && symbolNames.has(r.to),
  );

  if (relevant.length === 0) return [];

  const outgoing = new Map<string, string[]>();
  const incoming = new Set<string>();
  for (const r of relevant) {
    const list = outgoing.get(r.from) ?? [];
    list.push(r.to);
    outgoing.set(r.from, list);
    incoming.add(r.to);
  }

  const roots = [...symbolNames].filter(
    (name) => !incoming.has(name) && outgoing.has(name),
  );

  const chains: string[][] = [];
  const visited = new Set<string>();

  function walk(name: string, chain: string[]) {
    if (visited.has(name)) {
      chains.push(chain);
      return;
    }
    visited.add(name);
    chain.push(name);
    const targets = outgoing.get(name);
    if (!targets || targets.length === 0) {
      chains.push(chain);
      return;
    }
    for (const t of targets) {
      walk(t, [...chain]);
    }
  }

  for (const root of roots) {
    walk(root, []);
  }

  return chains;
}

export function AstAnalysis({ repo, prNumber }: Props) {
  const [symbols, setSymbols] = useState<ChangedSymbol[]>([]);
  const [relations, setRelations] = useState<SymbolRelation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ repo, number: String(prNumber) });
    fetch(`/api/ast-analysis?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setSymbols(d.symbols ?? []);
        setRelations(d.relations ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "解析に失敗しました"))
      .finally(() => setLoading(false));
  }, [repo, prNumber]);

  if (loading) {
    return <div className="ast-analysis-loading">AST解析中…</div>;
  }

  if (error) {
    return <div className="ast-analysis-error">{error}</div>;
  }

  if (symbols.length === 0) {
    return <div className="ast-analysis-empty">変更されたシンボルなし（対象言語: TypeScript, Go）</div>;
  }

  const grouped = new Map<string, ChangedSymbol[]>();
  for (const sym of symbols) {
    const list = grouped.get(sym.file) ?? [];
    list.push(sym);
    grouped.set(sym.file, list);
  }

  const symbolKindMap = new Map(symbols.map((s) => [s.name, s.kind]));
  const chains = buildFlowChains(symbols, relations);

  const relevantRelations = relations.filter((r) => {
    const names = new Set(symbols.map((s) => s.name));
    return names.has(r.from) && names.has(r.to);
  });

  return (
    <div className="ast-analysis">
      <div className="ast-analysis-header">
        <span className="ast-analysis-title">Changed Symbols</span>
        <span className="ast-analysis-count">{symbols.length} symbols</span>
      </div>

      {chains.length > 0 && (
        <div className="ast-analysis-flow-section">
          <div className="ast-analysis-flow-title">Call Flow</div>
          {chains.map((chain, i) => (
            <div key={i} className="ast-analysis-flow-chain">
              {chain.map((name, j) => (
                <span key={j}>
                  {j > 0 && <span className="ast-analysis-flow-arrow"> → </span>}
                  <span
                    className="ast-analysis-flow-name"
                    style={{ color: KIND_COLORS[symbolKindMap.get(name) ?? "unknown"] }}
                  >
                    {name}
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {relevantRelations.length > 0 && (
        <div className="ast-analysis-relations-section">
          <div className="ast-analysis-relations-title">Relations</div>
          {relevantRelations.map((r, i) => (
            <div key={i} className="ast-analysis-relation-row">
              <span
                className="ast-analysis-relation-name"
                style={{ color: KIND_COLORS[symbolKindMap.get(r.from) ?? "unknown"] }}
              >
                {r.from}
              </span>
              <span className="ast-analysis-relation-label">
                {RELATION_LABELS[r.kind]}
              </span>
              <span
                className="ast-analysis-relation-name"
                style={{ color: KIND_COLORS[symbolKindMap.get(r.to) ?? "unknown"] }}
              >
                {r.to}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="ast-analysis-list">
        {[...grouped.entries()].map(([file, syms]) => (
          <div key={file} className="ast-analysis-file-group">
            <div className="ast-analysis-file-path">{file}</div>
            {syms.map((sym) => (
              <div key={sym.id} className="ast-analysis-symbol-row">
                <span className="ast-analysis-symbol-dot" style={{ color: KIND_COLORS[sym.kind] }}>●</span>
                <span className="ast-analysis-symbol-name">{sym.name}</span>
                <span
                  className="ast-analysis-symbol-kind"
                  style={{ color: KIND_COLORS[sym.kind] }}
                >
                  {KIND_LABELS[sym.kind]}
                </span>
                <span className="ast-analysis-symbol-lines">
                  L{sym.startLine}-{sym.endLine}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
