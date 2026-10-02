// server/openapi/openapi-collect.ts の SpecFile と同じ形（/api/openapi のレスポンス）
export type ApiParam = {
  name: string;
  in: string;
  required: boolean;
  description?: string;
  schema?: unknown;
};

export type ApiBody = { required: boolean; contentType?: string; schema?: unknown };

export type ApiResponse = { status: string; description?: string; contentType?: string; schema?: unknown };

export type EndpointChange = "added" | "modified" | "removed" | "unchanged";

export type Scope = "changed" | "all";

export type ApiEndpoint = {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags: string[];
  deprecated: boolean;
  parameters: ApiParam[];
  requestBody?: ApiBody;
  responses: ApiResponse[];
  change: EndpointChange;
  changedParts: string[];
};

export type ApiSpec = { version: "2.0" | "3.x"; title?: string; endpoints: ApiEndpoint[] };

export type SpecFile = { path: string; changed: boolean; spec: ApiSpec };

export type TagGroup = { tag: string; endpoints: ApiEndpoint[] };

const DEFAULT_TAG = "default";

export function groupByTag(endpoints: ApiEndpoint[]): TagGroup[] {
  const groups = new Map<string, ApiEndpoint[]>();
  const untagged: ApiEndpoint[] = [];
  for (const e of endpoints) {
    const tag = e.tags[0];
    if (!tag) {
      untagged.push(e);
      continue;
    }
    groups.set(tag, [...(groups.get(tag) ?? []), e]);
  }
  const result = [...groups].map(([tag, eps]) => ({ tag, endpoints: eps }));
  return untagged.length > 0 ? [...result, { tag: DEFAULT_TAG, endpoints: untagged }] : result;
}

type Schema = Record<string, unknown>;

export function schemaTypeLabel(schema: unknown): string {
  if (typeof schema !== "object" || schema === null) {
    return "any";
  }
  const s = schema as Schema;
  if (typeof s.$ref === "string") {
    return s.$ref.split("/").pop() ?? s.$ref;
  }
  const union = s.oneOf ?? s.anyOf;
  if (Array.isArray(union)) {
    return union.map(schemaTypeLabel).join(" | ");
  }
  if (s.type === "array") {
    return `${schemaTypeLabel(s.items)}[]`;
  }
  const type = typeof s.type === "string" ? s.type : s.properties ? "object" : undefined;
  if (!type) {
    return "any";
  }
  return s.format ? `${type}(${s.format})` : type;
}

export function visibleEndpoints(endpoints: ApiEndpoint[], scope: Scope): ApiEndpoint[] {
  return scope === "changed" ? endpoints.filter((e) => e.change !== "unchanged") : endpoints;
}
