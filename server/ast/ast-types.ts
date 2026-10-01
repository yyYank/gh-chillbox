export type SymbolKind =
  | "function"
  | "method"
  | "class"
  | "component"
  | "hook"
  | "interface"
  | "type"
  | "struct"
  | "unknown";

export type SymbolRelation = {
  from: string;
  to: string;
  kind: "call" | "component-use" | "hook-use" | "method-call" | "http-infer";
};

export type ChangedSymbol = {
  id: string;
  name: string;
  kind: SymbolKind;
  file: string;
  startLine: number;
  endLine: number;
  changedLines: number[];
};

export type GoHttpRoute = {
  method: string;
  path: string;
  handler: string;
  line: number;
};

export type AstAnalysisResult = {
  symbols: ChangedSymbol[];
  relations: SymbolRelation[];
  moduleConnections: SymbolRelation[];
};
