import { describe, it, expect } from "vitest";
import { extractTsTestCases } from "./test-cases-ts";

function names(src: string, path = "a.test.ts") {
  const [file] = extractTsTestCases([{ path, content: src }]);
  return file.cases.map((c) => [c.kind, c.names.join(" > ")]);
}

describe("extractTsTestCases", () => {
  it("jest/vitest の describe と it/test を入れ子の名前つきで取り出す", () => {
    const src = `
describe("User", () => {
  describe("create", () => {
    it("名前ありで作れる", () => {});
  });
  test("削除できる", async () => {});
});
it("トップレベル", () => {});
`;
    expect(names(src)).toEqual([
      ["describe", "User"],
      ["describe", "User > create"],
      ["test", "User > create > 名前ありで作れる"],
      ["test", "User > 削除できる"],
      ["test", "トップレベル"],
    ]);
  });

  it("Playwright の test.describe と test を取り出し、framework を playwright にする", () => {
    const src = `
import { test, expect } from "@playwright/test";
test.describe("ログイン", () => {
  test.describe.serial("順番に", () => {
    test("成功する", async ({ page }) => {});
  });
});
`;
    const [file] = extractTsTestCases([{ path: "e2e/login.spec.ts", content: src }]);
    expect(file.framework).toBe("playwright");
    expect(file.cases.map((c) => c.names.join(" > "))).toEqual([
      "ログイン",
      "ログイン > 順番に",
      "ログイン > 順番に > 成功する",
    ]);
  });

  it("Playwright を import していなければ framework は jest", () => {
    const [file] = extractTsTestCases([{ path: "a.test.ts", content: `it("a", () => {});` }]);
    expect(file.framework).toBe("jest");
  });

  it("skip/only/todo/each などの修飾を modifiers に入れ、x/f 接頭辞も skip/only として扱う", () => {
    const src = `
it.skip("飛ばす", () => {});
test.only("これだけ", () => {});
it.todo("あとで");
describe.each([1, 2])("each %i", (n) => {});
xit("x付き", () => {});
fdescribe("f付き", () => {});
`;
    const [file] = extractTsTestCases([{ path: "a.test.ts", content: src }]);
    expect(file.cases.map((c) => [c.names[0], c.modifiers])).toEqual([
      ["飛ばす", ["skip"]],
      ["これだけ", ["only"]],
      ["あとで", ["todo"]],
      ["each %i", ["each"]],
      ["x付き", ["skip"]],
      ["f付き", ["only"]],
    ]);
  });

  it("名前が式で決まるものは式をそのまま名前にして dynamic を付ける", () => {
    const src = "it(`with ${x}`, () => {});\nit(`固定`, () => {});\nit(name, () => {});\n";
    const [file] = extractTsTestCases([{ path: "a.test.ts", content: src }]);
    expect(file.cases.map((c) => [c.names[0], c.dynamic])).toEqual([
      ["`with ${x}`", true],
      ["固定", false],
      ["name", true],
    ]);
  });

  it("test.step・フック・条件付きの test.skip(cond) はテストケースとして扱わない", () => {
    const src = `
import { test } from "@playwright/test";
test.beforeEach(async () => {});
test("本体", async ({ browserName }) => {
  test.skip(browserName === "firefox", "未対応");
  await test.step("手順", async () => {});
});
`;
    expect(names(src)).toEqual([["test", "本体"]]);
  });

  it("行番号を持つ", () => {
    const [file] = extractTsTestCases([
      { path: "a.test.ts", content: `\n\ndescribe("A", () => {\n  it("b", () => {});\n});\n` },
    ]);
    expect(file.cases.map((c) => c.line)).toEqual([3, 4]);
  });
});
