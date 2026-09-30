import { describe, it, expect } from "vitest";
import { isSpecCandidate, looksLikeOpenApi, collectSpecs } from "./openapi-collect";

describe("isSpecCandidate", () => {
  it("yaml/yml/json だけを対象にする", () => {
    expect(isSpecCandidate("docs/api.yaml")).toBe(true);
    expect(isSpecCandidate("docs/api.YML")).toBe(true);
    expect(isSpecCandidate("swagger.json")).toBe(true);
    expect(isSpecCandidate("src/main.go")).toBe(false);
    expect(isSpecCandidate("openapi.yaml.bak")).toBe(false);
  });
});

describe("looksLikeOpenApi", () => {
  it("YAML のトップレベルに openapi/swagger キーがあれば true", () => {
    expect(looksLikeOpenApi("# comment\nopenapi: 3.0.0\n")).toBe(true);
    expect(looksLikeOpenApi("swagger: \"2.0\"\n")).toBe(true);
  });

  it("整形済み・1行の JSON でも openapi/swagger キーを検出する", () => {
    expect(looksLikeOpenApi('{\n  "openapi": "3.1.0"\n}')).toBe(true);
    expect(looksLikeOpenApi('{"swagger":"2.0","paths":{}}')).toBe(true);
  });

  it("キー名の一部に含むだけのものは false", () => {
    expect(looksLikeOpenApi("name: my-openapi-tool\n")).toBe(false);
    expect(looksLikeOpenApi('{"dependencies":{"swagger-ui":"5"}}')).toBe(false);
  });
});

describe("collectSpecs", () => {
  const spec = "openapi: 3.0.0\npaths:\n  /a:\n    get: {}\n";

  it("openapi として読めたファイルだけを、変更の印とパス順で返す", () => {
    const result = collectSpecs([
      { path: "b/openapi.yaml", content: spec, changed: false },
      { path: "a/api.yaml", content: spec, changed: true },
      { path: "config.yaml", content: "name: foo\n", changed: true },
    ]);
    expect(result.map((r) => [r.path, r.changed, r.spec.endpoints.length])).toEqual([
      ["a/api.yaml", true, 1],
      ["b/openapi.yaml", false, 1],
    ]);
  });
});
