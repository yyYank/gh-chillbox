import { describe, it, expect } from "vitest";
import path from "node:path";
import { extractSymbolsFromFile, extractRelationsFromFile } from "./ast-ts";

const FIXTURE = path.resolve(__dirname, "test-fixtures/sample.tsx");

describe("extractSymbolsFromFile", () => {
  it("React Custom Hookを検出する", () => {
    const symbols = extractSymbolsFromFile(FIXTURE);
    const hook = symbols.find((s) => s.name === "useUser");
    expect(hook).toBeDefined();
    expect(hook!.kind).toBe("hook");
  });

  it("React Componentを検出する", () => {
    const symbols = extractSymbolsFromFile(FIXTURE);
    const comp = symbols.find((s) => s.name === "UserPage");
    expect(comp).toBeDefined();
    expect(comp!.kind).toBe("component");
  });

  it("classを検出する", () => {
    const symbols = extractSymbolsFromFile(FIXTURE);
    const cls = symbols.find((s) => s.name === "UserService");
    expect(cls).toBeDefined();
    expect(cls!.kind).toBe("class");
  });

  it("methodを検出する", () => {
    const symbols = extractSymbolsFromFile(FIXTURE);
    const methods = symbols.filter((s) => s.kind === "method");
    const names = methods.map((m) => m.name);
    expect(names).toContain("getUser");
    expect(names).toContain("updateUser");
  });

  it("interfaceを検出する", () => {
    const symbols = extractSymbolsFromFile(FIXTURE);
    const iface = symbols.find((s) => s.name === "UserRepository");
    expect(iface).toBeDefined();
    expect(iface!.kind).toBe("interface");
  });

  it("type aliasを検出する", () => {
    const symbols = extractSymbolsFromFile(FIXTURE);
    const t = symbols.find((s) => s.name === "UserDTO");
    expect(t).toBeDefined();
    expect(t!.kind).toBe("type");
  });

  it("通常のfunctionを検出する", () => {
    const symbols = extractSymbolsFromFile(FIXTURE);
    const fn = symbols.find((s) => s.name === "helperFn");
    expect(fn).toBeDefined();
    expect(fn!.kind).toBe("function");
  });

  it("各symbolにstartLine/endLineがある", () => {
    const symbols = extractSymbolsFromFile(FIXTURE);
    for (const s of symbols) {
      expect(s.startLine).toBeGreaterThan(0);
      expect(s.endLine).toBeGreaterThanOrEqual(s.startLine);
    }
  });
});

describe("extractRelationsFromFile", () => {
  it("UserPage → useUser のhook-use関係を検出する", () => {
    const relations = extractRelationsFromFile(FIXTURE);
    const hookUse = relations.find(
      (r) => r.from === "UserPage" && r.to === "useUser",
    );
    expect(hookUse).toBeDefined();
    expect(hookUse!.kind).toBe("hook-use");
  });

  it("同一シンボルへの自己参照は含まない", () => {
    const relations = extractRelationsFromFile(FIXTURE);
    const selfRef = relations.find((r) => r.from === r.to);
    expect(selfRef).toBeUndefined();
  });

  it("重複する関係を含まない", () => {
    const relations = extractRelationsFromFile(FIXTURE);
    const keys = relations.map((r) => `${r.from}:${r.to}:${r.kind}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
