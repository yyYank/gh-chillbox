import { scoreFile, type Layer } from "../change-surface/change-surface";

export type GraphNodeType =
  | "component"
  | "hook"
  | "function"
  | "handler"
  | "service"
  | "repository"
  | "database"
  | "type"
  | "unknown";

export type GraphNode = {
  id: string;
  name: string;
  type: GraphNodeType;
  changed: boolean;
  file?: string;
  line?: number;
};

export type GraphEdge = {
  from: string;
  to: string;
  relation: "call" | "render" | "hook" | "implements" | "unknown";
  confidence: "high" | "medium" | "low";
};

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

const KIND_TO_TYPE: Record<string, GraphNodeType> = {
  component: "component",
  hook: "hook",
  function: "function",
  method: "function",
  class: "function",
  interface: "type",
  type: "type",
  struct: "repository",
  unknown: "unknown",
};

const RELATION_KIND_MAP: Record<string, GraphEdge["relation"]> = {
  call: "call",
  "method-call": "call",
  "component-use": "render",
  "hook-use": "hook",
  "http-infer": "call",
};

const LOW_CONFIDENCE_KINDS = new Set(["http-infer"]);

function inferNodeType(kind: string, file: string): GraphNodeType {
  const mapped = KIND_TO_TYPE[kind];
  if (mapped && mapped !== "function") return mapped;

  if (/handler|controller|endpoint/i.test(file)) return "handler";
  if (/service/i.test(file)) return "service";
  if (/repositor|repo|dao|store/i.test(file)) return "repository";
  if (/database|migration|db/i.test(file)) return "database";

  return mapped ?? "unknown";
}

export function buildCallGraph(
  symbols: ChangedSymbol[],
  relations: SymbolRelation[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeMap = new Map<string, GraphNode>();

  for (const sym of symbols) {
    nodeMap.set(sym.name, {
      id: sym.name,
      name: sym.name,
      type: inferNodeType(sym.kind, sym.file),
      changed: true,
      file: sym.file,
      line: sym.startLine,
    });
  }

  const edges: GraphEdge[] = [];
  for (const r of relations) {
    if (!nodeMap.has(r.from)) {
      nodeMap.set(r.from, {
        id: r.from,
        name: r.from,
        type: "unknown",
        changed: false,
      });
    }
    if (!nodeMap.has(r.to)) {
      nodeMap.set(r.to, {
        id: r.to,
        name: r.to,
        type: "unknown",
        changed: false,
      });
    }
    edges.push({
      from: r.from,
      to: r.to,
      relation: RELATION_KIND_MAP[r.kind] ?? "unknown",
      confidence: LOW_CONFIDENCE_KINDS.has(r.kind) ? "low" : "high",
    });
  }

  return { nodes: [...nodeMap.values()], edges };
}

export function extractSubgraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  hops: number,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const changedIds = new Set(nodes.filter((n) => n.changed).map((n) => n.id));
  const included = new Set(changedIds);

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e.to]);
    incoming.set(e.to, [...(incoming.get(e.to) ?? []), e.from]);
  }

  let frontier = new Set(changedIds);
  for (let i = 0; i < hops; i++) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const neighbor of outgoing.get(id) ?? []) {
        if (!included.has(neighbor)) {
          included.add(neighbor);
          next.add(neighbor);
        }
      }
      for (const neighbor of incoming.get(id) ?? []) {
        if (!included.has(neighbor)) {
          included.add(neighbor);
          next.add(neighbor);
        }
      }
    }
    frontier = next;
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const subNodes = [...included]
    .map((id) => nodeMap.get(id))
    .filter((n): n is GraphNode => n !== undefined);
  const subEdges = edges.filter(
    (e) => included.has(e.from) && included.has(e.to),
  );

  return { nodes: subNodes, edges: subEdges };
}

const LAYER_READING_PRIORITY: Record<Layer, number> = {
  db: 0,
  domain: 1,
  data: 2,
  api: 3,
  ui: 4,
  test: 5,
  config: 6,
  docs: 7,
  other: 8,
};

const TYPE_READING_PRIORITY: Record<GraphNodeType, number> = {
  type: 0,
  database: 1,
  repository: 2,
  service: 3,
  handler: 4,
  function: 5,
  hook: 6,
  component: 7,
  unknown: 8,
};

export function generateReadingOrder(
  nodes: GraphNode[],
  edges: GraphEdge[],
): GraphNode[] {
  const changed = nodes.filter((n) => n.changed);
  if (changed.length === 0) return [];

  const inDegree = new Map<string, number>();
  for (const n of changed) inDegree.set(n.id, 0);
  for (const e of edges) {
    if (inDegree.has(e.to)) {
      inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
    }
  }

  function readingPriority(n: GraphNode): number {
    if (n.type === "type") return 0;
    if (!n.file) return TYPE_READING_PRIORITY[n.type];
    const layer = scoreFile({ path: n.file, additions: 1, deletions: 0 }).primaryLayer;
    const lp = LAYER_READING_PRIORITY[layer];
    if (lp < 8) return lp;
    return TYPE_READING_PRIORITY[n.type];
  }

  return [...changed].sort((a, b) => {
    const pa = readingPriority(a);
    const pb = readingPriority(b);
    if (pa !== pb) return pa - pb;

    const degA = inDegree.get(a.id) ?? 0;
    const degB = inDegree.get(b.id) ?? 0;
    return degA - degB;
  });
}
