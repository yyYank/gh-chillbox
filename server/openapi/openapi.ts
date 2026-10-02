import { parse as parseYaml } from "yaml";

export type ApiParam = {
  name: string;
  in: string;
  required: boolean;
  description?: string;
  schema?: unknown;
};

export type ApiBody = {
  required: boolean;
  contentType?: string;
  schema?: unknown;
};

export type ApiResponse = {
  status: string;
  description?: string;
  contentType?: string;
  schema?: unknown;
};

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
};

export type ApiSpec = {
  version: "2.0" | "3.x";
  title?: string;
  endpoints: ApiEndpoint[];
};

type Obj = Record<string, any>;

const HTTP_METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

// swagger 2.0 の非 body parameter はスキーマ相当のキーを parameter 直下に持つ
const V2_SCHEMA_KEYS = ["type", "format", "items", "enum", "default"];

export function parseOpenApi(content: string): ApiSpec | null {
  let doc: unknown;
  try {
    doc = parseYaml(content);
  } catch {
    return null;
  }
  if (!isObj(doc)) { return null; }

  const isV2 = typeof doc.swagger === "string" && doc.swagger.startsWith("2");
  const isV3 = typeof doc.openapi === "string" && doc.openapi.startsWith("3");
  if (!isV2 && !isV3) { return null; }

  const root = resolveRefs(doc, doc, []) as Obj;
  const endpoints: ApiEndpoint[] = [];
  for (const [path, item] of Object.entries(isObj(root.paths) ? root.paths : {})) {
    if (!isObj(item)) { continue; }
    for (const [method, op] of Object.entries(item)) {
      if (!HTTP_METHODS.has(method) || !isObj(op)) { continue; }
      endpoints.push(isV2
        ? toEndpointV2(root, method, path, item, op)
        : toEndpointV3(method, path, item, op));
    }
  }

  return {
    version: isV2 ? "2.0" : "3.x",
    title: isObj(root.info) ? root.info.title : undefined,
    endpoints,
  };
}

function toEndpointV3(method: string, path: string, item: Obj, op: Obj): ApiEndpoint {
  const body = isObj(op.requestBody) ? op.requestBody : undefined;
  return {
    ...baseEndpoint(method, path, op),
    parameters: mergeParams(item.parameters, op.parameters).map((p) => toParam(p, p.schema)),
    requestBody: body && { required: body.required === true, ...firstContent(body.content) },
    responses: responseEntries(op).map(([status, r]) => ({
      status,
      description: r.description,
      ...firstContent(r.content),
    })),
  };
}

function toEndpointV2(root: Obj, method: string, path: string, item: Obj, op: Obj): ApiEndpoint {
  const params = mergeParams(item.parameters, op.parameters);
  const body = params.find((p) => p.in === "body");
  const consumes = firstString(op.consumes) ?? firstString(root.consumes) ?? "application/json";
  const produces = firstString(op.produces) ?? firstString(root.produces);
  return {
    ...baseEndpoint(method, path, op),
    parameters: params.filter((p) => p.in !== "body").map((p) => toParam(p, v2Schema(p))),
    requestBody: body && { required: body.required === true, contentType: consumes, schema: body.schema },
    responses: responseEntries(op).map(([status, r]) => ({
      status,
      description: r.description,
      contentType: r.schema !== undefined ? produces : undefined,
      schema: r.schema,
    })),
  };
}

function baseEndpoint(method: string, path: string, op: Obj) {
  return {
    method: method.toUpperCase(),
    path,
    operationId: op.operationId,
    summary: op.summary,
    description: op.description,
    tags: Array.isArray(op.tags) ? op.tags.filter((t): t is string => typeof t === "string") : [],
    deprecated: op.deprecated === true,
  };
}

// path 共通の parameter を先に並べ、operation 側に同じ name+in があればそちらで置き換える
function mergeParams(pathParams: unknown, opParams: unknown): Obj[] {
  const key = (p: Obj) => `${p.in}:${p.name}`;
  const merged = new Map<string, Obj>();
  for (const p of [...asObjArray(pathParams), ...asObjArray(opParams)]) { merged.set(key(p), p); }
  return [...merged.values()];
}

function toParam(p: Obj, schema: unknown): ApiParam {
  return { name: p.name, in: p.in, required: p.required === true, description: p.description, schema };
}

function v2Schema(p: Obj): Obj | undefined {
  const entries = V2_SCHEMA_KEYS.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function responseEntries(op: Obj): [string, Obj][] {
  if (!isObj(op.responses)) { return []; }
  return Object.entries(op.responses)
    .filter((e): e is [string, Obj] => isObj(e[1]));
}

function firstContent(content: unknown): { contentType?: string; schema?: unknown } {
  if (!isObj(content)) { return { contentType: undefined, schema: undefined }; }
  const [contentType, media] = Object.entries(content)[0] ?? [];
  return { contentType, schema: isObj(media) ? media.schema : undefined };
}

// 同一ドキュメント内の "#/..." 参照だけを展開する。展開中の参照に戻ってきたら $ref のまま残す
function resolveRefs(node: unknown, root: Obj, stack: string[]): unknown {
  if (Array.isArray(node)) { return node.map((n) => resolveRefs(n, root, stack)); }
  if (!isObj(node)) { return node; }

  const ref = node.$ref;
  if (typeof ref === "string" && ref.startsWith("#/")) {
    if (stack.includes(ref)) { return node; }
    const target = lookupPointer(root, ref);
    return target === undefined ? node : resolveRefs(target, root, [...stack, ref]);
  }

  return Object.fromEntries(
    Object.entries(node).map(([k, v]) => [k, resolveRefs(v, root, stack)]),
  );
}

function lookupPointer(root: Obj, ref: string): unknown {
  let cur: unknown = root;
  for (const raw of ref.slice(2).split("/")) {
    const seg = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isObj(cur)) { return undefined; }
    cur = cur[seg];
  }
  return cur;
}

function firstString(v: unknown): string | undefined {
  return Array.isArray(v) && typeof v[0] === "string" ? v[0] : undefined;
}

function asObjArray(v: unknown): Obj[] {
  return Array.isArray(v) ? v.filter(isObj) : [];
}

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
