import { describe, it, expect } from "vitest";
import { parseOpenApi } from "./openapi";

describe("parseOpenApi", () => {
  it("swagger/openapi でない YAML は null を返す", () => {
    expect(parseOpenApi("name: foo\nversion: 1")).toBeNull();
  });

  it("壊れた YAML は null を返す", () => {
    expect(parseOpenApi("paths: [\n")).toBeNull();
  });

  it("OpenAPI 3.x の endpoint を method・path・summary 付きで抽出する", () => {
    const yaml = `
openapi: 3.0.0
info:
  title: User API
paths:
  /users:
    get:
      operationId: listUsers
      summary: ユーザー一覧
      tags: [user]
    post:
      operationId: createUser
      deprecated: true
`;
    const spec = parseOpenApi(yaml);
    expect(spec?.version).toBe("3.x");
    expect(spec?.title).toBe("User API");
    expect(spec?.endpoints.map((e) => [e.method, e.path, e.operationId])).toEqual([
      ["GET", "/users", "listUsers"],
      ["POST", "/users", "createUser"],
    ]);
    expect(spec?.endpoints[0].summary).toBe("ユーザー一覧");
    expect(spec?.endpoints[0].tags).toEqual(["user"]);
    expect(spec?.endpoints[1].deprecated).toBe(true);
  });

  it("JSON 形式の spec も読める", () => {
    const json = JSON.stringify({
      openapi: "3.1.0",
      paths: { "/ping": { get: { operationId: "ping" } } },
    });
    expect(parseOpenApi(json)?.endpoints[0].operationId).toBe("ping");
  });

  it("path 共通の parameter と operation の parameter をまとめ、同名は operation 側を優先する", () => {
    const yaml = `
openapi: 3.0.0
paths:
  /users/{id}:
    parameters:
      - name: id
        in: path
        description: path側
      - name: X-Trace
        in: header
    get:
      parameters:
        - name: id
          in: path
          required: true
          description: operation側
          schema: { type: string }
`;
    const params = parseOpenApi(yaml)?.endpoints[0].parameters;
    expect(params).toEqual([
      { name: "id", in: "path", required: true, description: "operation側", schema: { type: "string" } },
      { name: "X-Trace", in: "header", required: false, description: undefined, schema: undefined },
    ]);
  });

  it("3.x の requestBody と responses を content-type とスキーマ付きで抽出する", () => {
    const yaml = `
openapi: 3.0.0
paths:
  /users:
    post:
      requestBody:
        required: true
        content:
          application/json:
            schema: { type: object }
      responses:
        "201":
          description: created
          content:
            application/json:
              schema: { type: string }
        "400":
          description: bad
`;
    const ep = parseOpenApi(yaml)?.endpoints[0];
    expect(ep?.requestBody).toEqual({ required: true, contentType: "application/json", schema: { type: "object" } });
    expect(ep?.responses).toEqual([
      { status: "201", description: "created", contentType: "application/json", schema: { type: "string" } },
      { status: "400", description: "bad", contentType: undefined, schema: undefined },
    ]);
  });

  it("swagger 2.0 の body parameter を requestBody に、responses の schema をそのまま抽出する", () => {
    const yaml = `
swagger: "2.0"
consumes: [application/json]
produces: [application/json]
paths:
  /users:
    post:
      parameters:
        - name: body
          in: body
          required: true
          schema: { type: object }
        - name: dryRun
          in: query
          type: boolean
      responses:
        "200":
          description: ok
          schema: { type: string }
`;
    const spec = parseOpenApi(yaml);
    const ep = spec?.endpoints[0];
    expect(spec?.version).toBe("2.0");
    expect(ep?.requestBody).toEqual({ required: true, contentType: "application/json", schema: { type: "object" } });
    expect(ep?.parameters).toEqual([
      { name: "dryRun", in: "query", required: false, description: undefined, schema: { type: "boolean" } },
    ]);
    expect(ep?.responses).toEqual([
      { status: "200", description: "ok", contentType: "application/json", schema: { type: "string" } },
    ]);
  });

  it("ローカルの $ref を参照先の中身に展開する", () => {
    const yaml = `
openapi: 3.0.0
paths:
  /users/{id}:
    get:
      parameters:
        - $ref: "#/components/parameters/UserId"
      responses:
        "200":
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/User"
components:
  parameters:
    UserId: { name: id, in: path, required: true }
  schemas:
    User:
      type: object
      properties:
        name: { type: string }
`;
    const ep = parseOpenApi(yaml)?.endpoints[0];
    expect(ep?.parameters[0].name).toBe("id");
    expect(ep?.responses[0].schema).toEqual({
      type: "object",
      properties: { name: { type: "string" } },
    });
  });

  it("循環する $ref は無限展開せず、循環した箇所を $ref のまま残す", () => {
    const yaml = `
openapi: 3.0.0
paths:
  /nodes:
    get:
      responses:
        "200":
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Node"
components:
  schemas:
    Node:
      type: object
      properties:
        child:
          $ref: "#/components/schemas/Node"
`;
    const schema = parseOpenApi(yaml)?.endpoints[0].responses[0].schema;
    expect(schema).toEqual({
      type: "object",
      properties: { child: { $ref: "#/components/schemas/Node" } },
    });
  });
});
