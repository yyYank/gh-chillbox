import { describe, it, expect } from "vitest";
import path from "node:path";
import { extractSymbolsFromGoFile } from "./ast-go";

const FIXTURE = path.resolve(__dirname, "test-fixtures/sample.go");
const HTTP_FIXTURE = path.resolve(__dirname, "test-fixtures/sample-http.go");
const CROSSFILE_FIXTURE = path.resolve(__dirname, "test-fixtures/sample-crossfile.go");

describe("extractSymbolsFromGoFile", () => {
  it("structを検出する", async () => {
    const { symbols } = await extractSymbolsFromGoFile(FIXTURE);
    const s = symbols.find((s) => s.name === "User");
    expect(s).toBeDefined();
    expect(s!.kind).toBe("struct");
  });

  it("interfaceを検出する", async () => {
    const { symbols } = await extractSymbolsFromGoFile(FIXTURE);
    const iface = symbols.find((s) => s.name === "UserRepository");
    expect(iface).toBeDefined();
    expect(iface!.kind).toBe("interface");
  });

  it("functionを検出する", async () => {
    const { symbols } = await extractSymbolsFromGoFile(FIXTURE);
    const fn = symbols.find((s) => s.name === "NewUser");
    expect(fn).toBeDefined();
    expect(fn!.kind).toBe("function");
  });

  it("methodを検出する", async () => {
    const { symbols } = await extractSymbolsFromGoFile(FIXTURE);
    const m = symbols.find((s) => s.name === "UpdateName");
    expect(m).toBeDefined();
    expect(m!.kind).toBe("method");
  });

  it("各symbolにstartLine/endLineがある", async () => {
    const { symbols } = await extractSymbolsFromGoFile(FIXTURE);
    expect(symbols.length).toBeGreaterThan(0);
    for (const s of symbols) {
      expect(s.startLine).toBeGreaterThan(0);
      expect(s.endLine).toBeGreaterThanOrEqual(s.startLine);
    }
  });

  it("relationsを返す", async () => {
    const { relations } = await extractSymbolsFromGoFile(FIXTURE);
    expect(Array.isArray(relations)).toBe(true);
  });

  it("httpRoutesを返す", async () => {
    const { httpRoutes } = await extractSymbolsFromGoFile(FIXTURE);
    expect(Array.isArray(httpRoutes)).toBe(true);
  });
});

describe("Go HTTPルート抽出", () => {
  it("chiルーター登録からHTTPルートを検出する", async () => {
    const { httpRoutes } = await extractSymbolsFromGoFile(HTTP_FIXTURE);
    expect(httpRoutes.length).toBe(4);
    const get = httpRoutes.find((r) => r.handler === "ListUsers");
    expect(get).toBeDefined();
    expect(get!.method).toBe("GET");
    expect(get!.path).toBe("/api/users");
  });

  it("各HTTPルートにmethod, path, handler, lineがある", async () => {
    const { httpRoutes } = await extractSymbolsFromGoFile(HTTP_FIXTURE);
    for (const route of httpRoutes) {
      expect(route.method).toBeTruthy();
      expect(route.path).toMatch(/^\//);
      expect(route.handler).toBeTruthy();
      expect(route.line).toBeGreaterThan(0);
    }
  });
});

describe("Go クロスファイルrelation", () => {
  it("外部symbolを渡すと別ファイルの関数へのcall relationを検出する", async () => {
    const { symbols } = await extractSymbolsFromGoFile(FIXTURE);
    const externalNames = symbols.map((s) => s.name);

    const { relations } = await extractSymbolsFromGoFile(CROSSFILE_FIXTURE, externalNames);
    const callToScanUser = relations.find(
      (r) => r.from === "Anonymize" && r.to === "scanUser",
    );
    expect(callToScanUser).toBeDefined();
    expect(callToScanUser!.kind).toBe("call");
  });

  it("外部symbolなしでは同一ファイル内のcallのみ検出する", async () => {
    const { relations } = await extractSymbolsFromGoFile(CROSSFILE_FIXTURE);
    const callToScanUser = relations.find(
      (r) => r.from === "Anonymize" && r.to === "scanUser",
    );
    expect(callToScanUser).toBeDefined();
  });
});
