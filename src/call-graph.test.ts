import { describe, it, expect } from "vitest";
import {
  buildCallGraph,
  extractSubgraph,
  generateReadingOrder,
  type GraphNode,
  type GraphEdge,
} from "./call-graph";

const sym = (name: string, kind: string, file: string, changed = true) => ({
  id: `${file}:${name}`,
  name,
  kind: kind as any,
  file,
  startLine: 1,
  endLine: 10,
  changedLines: changed ? [3, 5] : [],
});

const rel = (from: string, to: string, kind: string = "call") => ({
  from,
  to,
  kind,
});

describe("buildCallGraph", () => {
  it("ChangedSymbolからchanged=trueのGraphNodeを生成する", () => {
    const symbols = [sym("useUser", "hook", "src/hooks/useUser.ts")];
    const { nodes } = buildCallGraph(symbols, []);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].changed).toBe(true);
    expect(nodes[0].name).toBe("useUser");
    expect(nodes[0].type).toBe("hook");
  });

  it("RelationからGraphEdgeを生成する", () => {
    const symbols = [
      sym("useUser", "hook", "src/hooks/useUser.ts"),
      sym("updateUser", "function", "src/api/updateUser.ts"),
    ];
    const relations = [rel("useUser", "updateUser")];
    const { edges } = buildCallGraph(symbols, relations);
    expect(edges).toHaveLength(1);
    expect(edges[0].from).toBe("useUser");
    expect(edges[0].to).toBe("updateUser");
    expect(edges[0].relation).toBe("call");
  });

  it("Relationのfrom/toに含まれる未変更Symbolをcontext nodeとして追加する", () => {
    const symbols = [sym("updateUser", "function", "src/api/updateUser.ts")];
    const relations = [
      rel("UserPage", "updateUser"),
      rel("updateUser", "UserRepository"),
    ];
    const { nodes } = buildCallGraph(symbols, relations);
    const contextNodes = nodes.filter((n) => !n.changed);
    expect(contextNodes).toHaveLength(2);
    expect(contextNodes.map((n) => n.name).sort()).toEqual(["UserPage", "UserRepository"].sort());
  });

  it("SymbolKindからGraphNodeのtypeを推定する", () => {
    const symbols = [
      sym("UserSettings", "component", "src/UserSettings.tsx"),
      sym("useUser", "hook", "src/hooks/useUser.ts"),
      sym("UpdateUser", "function", "src/domain/UpdateUser.ts"),
      sym("UserRepo", "struct", "src/repository/UserRepo.go"),
    ];
    const { nodes } = buildCallGraph(symbols, []);
    const typeMap = Object.fromEntries(nodes.map((n) => [n.name, n.type]));
    expect(typeMap["UserSettings"]).toBe("component");
    expect(typeMap["useUser"]).toBe("hook");
    expect(typeMap["UpdateUser"]).toBe("function");
    expect(typeMap["UserRepo"]).toBe("repository");
  });
});

describe("extractSubgraph", () => {
  it("1-hopでChanged Symbolの前後1段階のNodeを含む", () => {
    const nodes: GraphNode[] = [
      { id: "A", name: "A", type: "component", changed: false },
      { id: "B", name: "B", type: "hook", changed: true, file: "b.ts" },
      { id: "C", name: "C", type: "function", changed: false },
      { id: "D", name: "D", type: "function", changed: false },
    ];
    const edges: GraphEdge[] = [
      { from: "A", to: "B", relation: "call", confidence: "high" },
      { from: "B", to: "C", relation: "call", confidence: "high" },
      { from: "C", to: "D", relation: "call", confidence: "high" },
    ];
    const sub = extractSubgraph(nodes, edges, 1);
    expect(sub.nodes.map((n) => n.name).sort()).toEqual(["A", "B", "C"].sort());
    expect(sub.nodes.find((n) => n.name === "D")).toBeUndefined();
  });

  it("2-hopでChanged Symbolの前後2段階のNodeを含む", () => {
    const nodes: GraphNode[] = [
      { id: "A", name: "A", type: "component", changed: false },
      { id: "B", name: "B", type: "hook", changed: true, file: "b.ts" },
      { id: "C", name: "C", type: "function", changed: false },
      { id: "D", name: "D", type: "function", changed: false },
    ];
    const edges: GraphEdge[] = [
      { from: "A", to: "B", relation: "call", confidence: "high" },
      { from: "B", to: "C", relation: "call", confidence: "high" },
      { from: "C", to: "D", relation: "call", confidence: "high" },
    ];
    const sub = extractSubgraph(nodes, edges, 2);
    expect(sub.nodes.map((n) => n.name).sort()).toEqual(["A", "B", "C", "D"].sort());
  });

  it("Changed Symbol同士が接続されている場合は一本の経路にまとまる", () => {
    const nodes: GraphNode[] = [
      { id: "A", name: "A", type: "hook", changed: true, file: "a.ts" },
      { id: "B", name: "B", type: "function", changed: true, file: "b.ts" },
      { id: "C", name: "C", type: "function", changed: true, file: "c.ts" },
    ];
    const edges: GraphEdge[] = [
      { from: "A", to: "B", relation: "call", confidence: "high" },
      { from: "B", to: "C", relation: "call", confidence: "high" },
    ];
    const sub = extractSubgraph(nodes, edges, 1);
    expect(sub.nodes).toHaveLength(3);
    expect(sub.edges).toHaveLength(2);
  });
});

describe("generateReadingOrder", () => {
  it("Schema/Type → Domain → Data → API → UI → Testの優先順位で並ぶ", () => {
    const nodes: GraphNode[] = [
      { id: "UserPage", name: "UserPage", type: "component", changed: true, file: "src/components/UserPage.tsx" },
      { id: "UpdateUser", name: "UpdateUser", type: "function", changed: true, file: "src/domain/UpdateUser.ts" },
      { id: "UserType", name: "UserType", type: "type", changed: true, file: "src/types/User.ts" },
      { id: "UserRepo", name: "UserRepo", type: "repository", changed: true, file: "src/repository/UserRepo.ts" },
    ];
    const order = generateReadingOrder(nodes, []);
    expect(order[0].name).toBe("UserType");
    expect(order[1].name).toBe("UpdateUser");
    expect(order[2].name).toBe("UserRepo");
    expect(order[3].name).toBe("UserPage");
  });

  it("Context nodeは含まない（Changed nodeのみ）", () => {
    const nodes: GraphNode[] = [
      { id: "A", name: "A", type: "function", changed: true, file: "a.ts" },
      { id: "B", name: "B", type: "function", changed: false },
    ];
    const order = generateReadingOrder(nodes, []);
    expect(order).toHaveLength(1);
    expect(order[0].name).toBe("A");
  });

  it("空のnode配列では空配列を返す", () => {
    expect(generateReadingOrder([], [])).toEqual([]);
  });
});

describe("buildCallGraph - HTTP推定", () => {
  it("http-inferリレーションはconfidence=lowのedgeになる", () => {
    const symbols = [
      sym("UserPage", "component", "src/UserPage.tsx"),
      sym("listUsers", "function", "server/routes/users.ts"),
    ];
    const relations = [rel("UserPage", "listUsers", "http-infer")];
    const { edges } = buildCallGraph(symbols, relations);
    expect(edges).toHaveLength(1);
    expect(edges[0].confidence).toBe("low");
    expect(edges[0].relation).toBe("call");
  });

  it("通常のcallリレーションはconfidence=highのまま", () => {
    const symbols = [
      sym("useUser", "hook", "src/hooks/useUser.ts"),
      sym("updateUser", "function", "src/api/updateUser.ts"),
    ];
    const relations = [rel("useUser", "updateUser", "call")];
    const { edges } = buildCallGraph(symbols, relations);
    expect(edges[0].confidence).toBe("high");
  });
});
