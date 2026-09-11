import { describe, it, expect } from "vitest";
import path from "node:path";
import { extractSymbolsFromGoFile } from "./ast-go";

const FIXTURE = path.resolve(__dirname, "test-fixtures/sample.go");

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
});
