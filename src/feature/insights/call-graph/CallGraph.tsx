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
  const [moduleConnections, setModuleConnections] = useState<SymbolRelation[]>([]);
  const [hops, setHops] = useState(1);
  const [includeTests, setIncludeTests] = useState(false);
  const [activeTab, setActiveTab] = useState<"callgraph" | "module-connections">("callgraph");

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
        setModuleConnections(d.moduleConnections ?? []);
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
  const trees = buildTrees(roots, nodes, edges);

  const hasFlow = trees.some((t) => t.children.length > 0);
  const testCount = symbols.filter((s) => isTestFile(s.file)).length;

  return (
    <div className="cg-container">
      <div className="cg-tab-bar">
        <button
          type="button"
          className={`cg-tab${activeTab === "callgraph" ? " cg-tab-active" : ""}`}
          onClick={() => setActiveTab("callgraph")}
        >
          Call Graph
        </button>
        <button
          type="button"
          className={`cg-tab${activeTab === "module-connections" ? " cg-tab-active" : ""}`}
          onClick={() => setActiveTab("module-connections")}
        >
          Module Connections Candidate{moduleConnections.length > 0 ? ` (${moduleConnections.length})` : ""}
        </button>
      </div>

      {activeTab === "module-connections" ? (
        <ModuleConnectionsCandidate symbols={symbols} moduleConnections={moduleConnections} />
      ) : (
      <>
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
          {trees.filter((t) => t.children.length > 0).map((tree, ti) => (
            <CallTreeNode key={ti} tree={tree} confidenceMap={confidenceMap} />
          ))}
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
      </>
      )}
    </div>
  );
}

type CallTree = {
  node: FlowNode;
  children: CallTree[];
};

function findRoots(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const hasIncoming = new Set(edges.map((e) => e.to));
  const roots = nodes.filter((n) => !hasIncoming.has(n.id));
  if (roots.length === 0 && nodes.length > 0) return [nodes[0]];
  return roots;
}

function buildTrees(roots: GraphNode[], nodes: GraphNode[], edges: GraphEdge[]): CallTree[] {
  const outgoing = new Map<string, string[]>();
  for (const e of edges) {
    outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e.to]);
  }
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();

  function build(id: string): CallTree | null {
    if (visited.has(id)) return null;
    visited.add(id);
    const node = nodeMap.get(id);
    if (!node) return null;
    const targets = outgoing.get(id) ?? [];
    const children: CallTree[] = [];
    for (const t of targets) {
      const child = build(t);
      if (child) children.push(child);
    }
    return { node: toFlowNode(node), children };
  }

  const trees: CallTree[] = [];
  for (const root of roots) {
    const tree = build(root.id);
    if (tree) trees.push(tree);
  }
  return trees;
}

function CallTreeNode({ tree, confidenceMap, depth = 0 }: {
  tree: CallTree;
  confidenceMap: Map<string, GraphEdge["confidence"]>;
  depth?: number;
}) {
  const { node, children } = tree;

  if (children.length === 0) {
    return (
      <div className="cg-tree-leaf">
        <div
          className={`cg-box${node.changed ? " cg-box-changed" : " cg-box-context"}`}
          style={{ borderLeftColor: NODE_TYPE_COLORS[node.type] ?? "#6b7280" }}
        >
          <div className="cg-box-app">{node.appName}</div>
          <div className="cg-box-file">{node.fileName}</div>
          <div className="cg-box-symbol">{node.name}()</div>
        </div>
      </div>
    );
  }

  return (
    <div className="cg-tree-row">
      <div
        className={`cg-box${node.changed ? " cg-box-changed" : " cg-box-context"}`}
        style={{ borderLeftColor: NODE_TYPE_COLORS[node.type] ?? "#6b7280" }}
      >
        <div className="cg-box-app">{node.appName}</div>
        <div className="cg-box-file">{node.fileName}</div>
        <div className="cg-box-symbol">{node.name}()</div>
      </div>
      <div className="cg-tree-branch">
        {children.map((child, i) => (
          <div key={i} className={`cg-tree-branch-item${i === children.length - 1 ? " cg-tree-branch-last" : ""}`}>
            <div className="cg-tree-branch-line" />
            <div className="cg-arrow">→</div>
            <CallTreeNode tree={child} confidenceMap={confidenceMap} depth={depth + 1} />
          </div>
        ))}
      </div>
    </div>
  );
}

type ModuleConnectionsCandidateProps = {
  symbols: ChangedSymbol[];
  moduleConnections: SymbolRelation[];
};

const HTTP_METHOD_COLORS: Record<string, string> = {
  GET: "#34d399",
  POST: "#60a5fa",
  PATCH: "#fbbf24",
  PUT: "#a78bfa",
  DELETE: "#f87171",
};

const KIND_LABELS: Record<string, string> = {
  "http-infer": "HTTP",
  call: "call",
  "method-call": "method",
  "component-use": "component",
  "hook-use": "hook",
};

function extractHttpMethod(name: string): string | null {
  const match = name.match(/^(GET|POST|PUT|PATCH|DELETE)\s/);
  return match ? match[1] : null;
}

type McGrouped = {
  key: string;
  fromApp: string;
  toApp: string;
  items: { mc: SymbolRelation; fromFile: string; toFile: string }[];
};

function ModuleConnectionsCandidate({ symbols, moduleConnections }: ModuleConnectionsCandidateProps) {
  if (moduleConnections.length === 0) {
    return <div className="cg-status">モジュール間接続の候補なし</div>;
  }

  const symbolMap = new Map(symbols.map((s) => [s.name, s]));

  const groups: McGrouped[] = [];
  const groupMap = new Map<string, McGrouped>();
  for (const mc of moduleConnections) {
    const fromSym = symbolMap.get(mc.from);
    const toSym = symbolMap.get(mc.to);
    const fromApp = fromSym ? deriveAppName(fromSym.file) : "unknown";
    const toApp = toSym ? deriveAppName(toSym.file) : "unknown";
    const key = `${fromApp}→${toApp}`;
    let group = groupMap.get(key);
    if (!group) {
      group = { key, fromApp, toApp, items: [] };
      groupMap.set(key, group);
      groups.push(group);
    }
    group.items.push({
      mc,
      fromFile: fromSym ? shortenFile(fromSym.file) : "",
      toFile: toSym ? shortenFile(toSym.file) : "",
    });
  }

  return (
    <div className="cg-module-connections">
      {groups.map((group) => (
        <div key={group.key} className="mc-group">
          <div className="mc-group-header">
            <span className="mc-group-app">{group.fromApp}</span>
            <span className="mc-group-arrow">→</span>
            <span className="mc-group-app">{group.toApp}</span>
          </div>
          {group.items.map((item, i) => {
            const fromMethod = extractHttpMethod(item.mc.from);
            const toMethod = extractHttpMethod(item.mc.to);
            return (
              <div key={i} className="mc-row">
                <div className="mc-node">
                  {fromMethod && (
                    <span className="mc-method-badge" style={{ background: HTTP_METHOD_COLORS[fromMethod] ?? "#6b7280" }}>
                      {fromMethod}
                    </span>
                  )}
                  <span className="mc-symbol">{item.mc.from}</span>
                  <span className="mc-file">{item.fromFile}</span>
                </div>
                <div className="mc-edge">
                  <span className="mc-edge-arrow">⇢</span>
                  <span className="mc-edge-kind">{KIND_LABELS[item.mc.kind] ?? item.mc.kind}</span>
                </div>
                <div className="mc-node">
                  {toMethod && (
                    <span className="mc-method-badge" style={{ background: HTTP_METHOD_COLORS[toMethod] ?? "#6b7280" }}>
                      {toMethod}
                    </span>
                  )}
                  <span className="mc-symbol">{item.mc.to}</span>
                  <span className="mc-file">{item.toFile}</span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
