import { describe, it, expect } from "vitest";
import { groupByTag, schemaTypeLabel, type ApiEndpoint } from "./api-preview";

function ep(method: string, path: string, tags: string[] = []): ApiEndpoint {
  return { method, path, tags, deprecated: false, parameters: [], responses: [] };
}

describe("groupByTag", () => {
  it("最初の tag ごとにまとめ、tag の出現順を保つ", () => {
    const groups = groupByTag([
      ep("GET", "/users", ["user"]),
      ep("GET", "/items", ["item"]),
      ep("POST", "/users", ["user", "admin"]),
    ]);
    expect(groups.map((g) => [g.tag, g.endpoints.map((e) => `${e.method} ${e.path}`)])).toEqual([
      ["user", ["GET /users", "POST /users"]],
      ["item", ["GET /items"]],
    ]);
  });

  it("tag の無い endpoint は最後の default グループに入る", () => {
    const groups = groupByTag([ep("GET", "/ping"), ep("GET", "/users", ["user"])]);
    expect(groups.map((g) => g.tag)).toEqual(["user", "default"]);
  });
});

describe("schemaTypeLabel", () => {
  it("配列は要素の型を付けて表示する", () => {
    expect(schemaTypeLabel({ type: "array", items: { type: "string" } })).toBe("string[]");
  });

  it("format があれば括弧で添える", () => {
    expect(schemaTypeLabel({ type: "string", format: "date-time" })).toBe("string(date-time)");
  });

  it("展開できなかった $ref は参照名を表示する", () => {
    expect(schemaTypeLabel({ $ref: "#/components/schemas/Node" })).toBe("Node");
  });

  it("type が無く properties があれば object とみなす", () => {
    expect(schemaTypeLabel({ properties: { a: {} } })).toBe("object");
  });

  it("oneOf/anyOf は候補を | でつなぐ", () => {
    expect(schemaTypeLabel({ oneOf: [{ type: "string" }, { type: "integer" }] })).toBe("string | integer");
  });

  it("判断できないものは any", () => {
    expect(schemaTypeLabel(undefined)).toBe("any");
  });
});
