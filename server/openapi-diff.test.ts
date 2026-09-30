import { describe, it, expect } from "vitest";
import { diffEndpoints } from "./openapi-diff";
import type { ApiEndpoint } from "./openapi";

function ep(method: string, path: string, extra: Partial<ApiEndpoint> = {}): ApiEndpoint {
  return { method, path, tags: [], deprecated: false, parameters: [], responses: [], ...extra };
}

describe("diffEndpoints", () => {
  it("method+path で突き合わせ、head にだけあるものを added、base にだけあるものを removed にする", () => {
    const result = diffEndpoints(
      [ep("GET", "/users"), ep("DELETE", "/users/{id}")],
      [ep("GET", "/users"), ep("POST", "/users")],
    );
    expect(result.map((e) => [e.method, e.path, e.change])).toEqual([
      ["GET", "/users", "unchanged"],
      ["POST", "/users", "added"],
      ["DELETE", "/users/{id}", "removed"],
    ]);
  });

  it("同じ path でも method が違えば別の endpoint として扱う", () => {
    const result = diffEndpoints([ep("GET", "/users")], [ep("PUT", "/users")]);
    expect(result.map((e) => [e.method, e.change])).toEqual([
      ["PUT", "added"],
      ["GET", "removed"],
    ]);
  });

  it("中身が変わった endpoint は modified にし、変わった項目名を changedParts に入れる", () => {
    const base = ep("POST", "/users", {
      summary: "作成",
      parameters: [{ name: "dryRun", in: "query", required: false }],
      responses: [{ status: "201" }],
    });
    const head = ep("POST", "/users", {
      summary: "作成",
      parameters: [{ name: "dryRun", in: "query", required: true }],
      requestBody: { required: true, schema: { type: "object" } },
      responses: [{ status: "201" }],
    });
    const [result] = diffEndpoints([base], [head]);
    expect(result.change).toBe("modified");
    expect(result.changedParts).toEqual(["parameters", "requestBody"]);
  });

  it("スキーマの奥の変更も modified として検出する", () => {
    const schema = (t: string) => ({ type: "object", properties: { name: { type: t } } });
    const [result] = diffEndpoints(
      [ep("GET", "/u", { responses: [{ status: "200", schema: schema("string") }] })],
      [ep("GET", "/u", { responses: [{ status: "200", schema: schema("integer") }] })],
    );
    expect(result.change).toBe("modified");
    expect(result.changedParts).toEqual(["responses"]);
  });

  it("オブジェクトのキー順だけが違う場合は unchanged", () => {
    const [result] = diffEndpoints(
      [ep("GET", "/u", { responses: [{ status: "200", schema: { type: "object", title: "U" } }] })],
      [ep("GET", "/u", { responses: [{ status: "200", schema: { title: "U", type: "object" } }] })],
    );
    expect(result.change).toBe("unchanged");
    expect(result.changedParts).toEqual([]);
  });
});
