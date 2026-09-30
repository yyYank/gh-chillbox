import type { ApiEndpoint } from "./openapi";

export type EndpointChange = "added" | "modified" | "removed" | "unchanged";

export type DiffedEndpoint = ApiEndpoint & {
  change: EndpointChange;
  changedParts: string[];
};

const COMPARED_PARTS = [
  "operationId",
  "summary",
  "description",
  "tags",
  "deprecated",
  "parameters",
  "requestBody",
  "responses",
] as const satisfies readonly (keyof ApiEndpoint)[];

// head の並び順を保ち、base にだけある endpoint は末尾に removed として足す
export function diffEndpoints(base: ApiEndpoint[], head: ApiEndpoint[]): DiffedEndpoint[] {
  const key = (e: ApiEndpoint) => `${e.method} ${e.path}`;
  const baseByKey = new Map(base.map((e) => [key(e), e]));
  const headKeys = new Set(head.map(key));

  const current = head.map((e): DiffedEndpoint => {
    const before = baseByKey.get(key(e));
    if (!before) return { ...e, change: "added", changedParts: [] };
    const changedParts = COMPARED_PARTS.filter((p) => canonical(before[p]) !== canonical(e[p]));
    return { ...e, change: changedParts.length > 0 ? "modified" : "unchanged", changedParts };
  });
  const removed = base
    .filter((e) => !headKeys.has(key(e)))
    .map((e): DiffedEndpoint => ({ ...e, change: "removed", changedParts: [] }));

  return [...current, ...removed];
}

export function markUnchanged(endpoints: ApiEndpoint[]): DiffedEndpoint[] {
  return endpoints.map((e) => ({ ...e, change: "unchanged", changedParts: [] }));
}

// キー順の違いを無視して比べるため、キーを並べ替えた JSON にする
function canonical(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    typeof v === "object" && v !== null && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  ) ?? "undefined";
}
