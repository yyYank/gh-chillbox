import { useState, useEffect } from "react";
import {
  buildCallGraph,
  extractSubgraph,
  generateReadingOrder,
  type GraphNode,
  type GraphEdge,
} from "./call-graph";

type ChangedSymbol = {
  id: string;
  name: string;
  kind: string;
  file: string;
  startLine: number;
  endLine: number;
  changedLines: number[];
};

type SymbolRelation = {
  from: string;
  to: string;
  kind: string;
};

type Props = {
  repo: string;
  prNumber: number;
};

function isTestFile(file: string): boolean {
  return /\.test\.[jt]sx?$|\.spec\.[jt]sx?$|_test\.go$|(?:^|\/)__tests__\//.test(file);
}

function deriveAppName(file: string): string {
  const parts = file.split("/");
  if (parts[0] === "apps" && parts.length > 1) return parts[1];
  if (parts[0] === "packages" && parts.length > 1) return parts[1];
  if (parts[0] === "server") return "server";
  if (parts[0] === "src") return "src";
  if (parts.length >= 2 && (parts[0] === "internal" || parts[0] === "cmd" || parts[0] === "pkg")) {
    return parts[1];
  }
  return parts[0];
}

function shortenFile(file: string): string {
  const parts = file.split("/");
  return parts[parts.length - 1];
}

type FlowNode = GraphNode & { appName: string; fileName: string };

function toFlowNode(node: GraphNode): FlowNode {
  return {
    ...node,
    appName: node.file ? deriveAppName(node.file) : "unknown",
    fileName: node.file ? shortenFile(node.file) : "",
  };
}

type LayerGroup = {
  label: string;
  nodes: FlowNode[];
};

function groupByLayer(chain: FlowNode[]): LayerGroup[] {
  const groups: LayerGroup[] = [];
  let current: LayerGroup | null = null;
  for (const node of chain) {
    if (!current || current.label !== node.appName) {
      current = { label: node.appName, nodes: [] };
      groups.push(current);
    }
    current.nodes.push(node);
  }
  return groups;
}

const NODE_TYPE_COLORS: Record<string, string> = {
  component: "#34d399",
  hook: "#f472b6",
  function: "#a78bfa",
  handler: "#fbbf24",
  service: "#38bdf8",
  repository: "#fb923c",
  database: "#f87171",
  type: "#94a3b8",
  unknown: "#6b7280",
};

function buildEdgeConfidenceMap(edges: GraphEdge[]): Map<string, GraphEdge["confidence"]> {
  const map = new Map<string, GraphEdge["confidence"]>();
  for (const e of edges) {
    map.set(`${e.from}→${e.to}`, e.confidence);
  }
  return map;
}

export function CallGraph({ repo, prNumber }: Props) {
  const [symbols, setSymbols] = useState<ChangedSymbol[]>([]);
  const [relations, setRelations] = useState<SymbolRelation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hops, setHops] = useState(1);
  const [includeTests, setIncludeTests] = useState(false);

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

  if (loading) return <div className="cg-status">AST解析中…</div>;
  if (error) return <div className="cg-status cg-error">{error}</div>;
  if (symbols.length === 0) return <div className="cg-status">変更されたシンボルなし</div>;

  const filteredSymbols = includeTests ? symbols : symbols.filter((s) => !isTestFile(s.file));
  const filteredRelations = includeTests
    ? relations
    : relations.filter((r) => {
        const fromSym = symbols.find((s) => s.name === r.from);
        const toSym = symbols.find((s) => s.name === r.to);
        const fromTest = fromSym && isTestFile(fromSym.file);
        const toTest = toSym && isTestFile(toSym.file);
        return !fromTest && !toTest;
      });

  const full = buildCallGraph(filteredSymbols, filteredRelations);
  const { nodes, edges } = extractSubgraph(full.nodes, full.edges, hops);
  const readingOrder = generateReadingOrder(full.nodes, full.edges);
  const confidenceMap = buildEdgeConfidenceMap(edges);

  const roots = findRoots(nodes, edges);
  const chains = buildChains(roots, nodes, edges);

  const hasFlow = chains.some((c) => c.length > 1);
  const testCount = symbols.filter((s) => isTestFile(s.file)).length;

  return (
    <div className="cg-container">
      <div className="cg-header">
        <span className="cg-title">Change Flow</span>
        <div className="cg-controls">
          <div className="cg-hop-toggle">
            <button
              type="button"
              className={`cg-hop-btn${hops === 1 ? " active" : ""}`}
              onClick={() => setHops(1)}
            >
              1-hop
            </button>
            <button
              type="button"
              className={`cg-hop-btn${hops === 2 ? " active" : ""}`}
              onClick={() => setHops(2)}
            >
              2-hop
            </button>
          </div>
          {testCount > 0 && (
            <label className="cg-test-toggle">
              <input
                type="checkbox"
                checked={includeTests}
                onChange={(e) => setIncludeTests(e.target.checked)}
              />
              Test ({testCount})
            </label>
          )}
        </div>
      </div>

      {hasFlow ? (
        <div className="cg-flow-scroll">
          {chains.filter((c) => c.length > 1).map((chain, ci) => {
            const flowNodes = chain.map(toFlowNode);
            const layerGroups = groupByLayer(flowNodes);
            return (
              <div key={ci} className="cg-flow-row">
                {layerGroups.map((group, gi) => (
                  <div key={gi} className="cg-layer-group">
                    <div className="cg-layer-label">{group.label}</div>
                    <div className="cg-layer-nodes">
                      {group.nodes.map((node, ni) => {
                        const actuallyLast = gi === layerGroups.length - 1 && ni === group.nodes.length - 1;
                        const nextNode = !actuallyLast ? getNextNodeInChain(chain, node) : null;
                        const edgeConfidence = nextNode ? confidenceMap.get(`${node.id}→${nextNode.id}`) : undefined;
                        const isDashed = edgeConfidence === "low";
                        return (
                          <div key={node.id} className="cg-node-with-arrow">
                            <div
                              className={`cg-box${node.changed ? " cg-box-changed" : " cg-box-context"}`}
                              style={{ borderLeftColor: NODE_TYPE_COLORS[node.type] ?? "#6b7280" }}
                            >
                              <div className="cg-box-app">{node.appName}</div>
                              <div className="cg-box-file">{node.fileName}</div>
                              <div className="cg-box-symbol">{node.name}()</div>
                            </div>
                            {!actuallyLast && (
                              <div className={`cg-arrow${isDashed ? " cg-arrow-inferred" : ""}`}>
                                {isDashed ? "⇢" : "→"}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="cg-status">接続された呼び出し経路が見つかりませんでした</div>
      )}

      {readingOrder.length > 1 && (
        <div className="cg-reading-order">
          <div className="cg-reading-title">Recommended Reading Order</div>
          <ol className="cg-reading-list">
            {readingOrder.map((node, i) => (
              <li key={node.id} className="cg-reading-item">
                <span className="cg-reading-num">{i + 1}.</span>
                <span
                  className="cg-reading-name"
                  style={{ color: NODE_TYPE_COLORS[node.type] }}
                >
                  {node.name}
                </span>
                <span className="cg-reading-type">{node.type}</span>
                {node.file && <span className="cg-reading-file">{node.file}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function getNextNodeInChain(chain: GraphNode[], current: GraphNode): GraphNode | null {
  const idx = chain.indexOf(current);
  if (idx < 0 || idx >= chain.length - 1) return null;
  return chain[idx + 1];
}

function findRoots(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const hasIncoming = new Set(edges.map((e) => e.to));
  const roots = nodes.filter((n) => !hasIncoming.has(n.id));
  if (roots.length === 0 && nodes.length > 0) return [nodes[0]];
  return roots;
}

function buildChains(roots: GraphNode[], nodes: GraphNode[], edges: GraphEdge[]): GraphNode[][] {
  const outgoing = new Map<string, string[]>();
  for (const e of edges) {
    outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e.to]);
  }
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const chains: GraphNode[][] = [];
  const visited = new Set<string>();

  function walk(id: string, chain: GraphNode[]) {
    if (visited.has(id)) {
      if (chain.length > 0) chains.push(chain);
      return;
    }
    visited.add(id);
    const node = nodeMap.get(id);
    if (!node) return;
    chain.push(node);
    const targets = outgoing.get(id);
    if (!targets || targets.length === 0) {
      chains.push(chain);
      return;
    }
    for (const t of targets) {
      walk(t, [...chain]);
    }
  }

  for (const root of roots) {
    walk(root.id, []);
  }

  return chains;
}
