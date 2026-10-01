import { describe, it, expect } from "vitest";
import { extractGoTestCases } from "./test-cases-go";

const SRC = `package user

import "testing"

func TestCreate(t *testing.T) {
	t.Run("正常系", func(t *testing.T) {
		t.Run("名前あり", func(t *testing.T) {})
	})
	t.Run("異常系", func(tt *testing.T) {
		tt.Run("空文字", func(t *testing.T) {})
	})
}

func TestTable(t *testing.T) {
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {})
	}
}

func BenchmarkCreate(b *testing.B) {
	b.Run("small", func(b *testing.B) {})
}

func FuzzParse(f *testing.F) {}

func Testhelper(t *testing.T) {}

func helper(t *testing.T) {
	t.Run("helper内", func(t *testing.T) {})
}
`;

describe("extractGoTestCases", () => {
  it("Test・Benchmark・Fuzz 関数と、入れ子の t.Run を名前のパスつきで取り出す", async () => {
    const [file] = await extractGoTestCases([{ path: "user/user_test.go", content: SRC }]);
    expect(file.path).toBe("user/user_test.go");
    expect(file.cases.map((c) => [c.kind, c.names.join(" > ")])).toEqual([
      ["test", "TestCreate"],
      ["test", "TestCreate > 正常系"],
      ["test", "TestCreate > 正常系 > 名前あり"],
      ["test", "TestCreate > 異常系"],
      ["test", "TestCreate > 異常系 > 空文字"],
      ["test", "TestTable"],
      ["test", "TestTable > tc.name"],
      ["benchmark", "BenchmarkCreate"],
      ["benchmark", "BenchmarkCreate > small"],
      ["fuzz", "FuzzParse"],
    ]);
  });

  it("名前が文字列リテラルでない t.Run は式をそのまま名前にし、dynamic を付ける", async () => {
    const [file] = await extractGoTestCases([{ path: "a_test.go", content: SRC }]);
    const table = file.cases.find((c) => c.names.join(" > ") === "TestTable > tc.name");
    expect(table?.dynamic).toBe(true);
    expect(file.cases.find((c) => c.names.join(" > ") === "TestCreate > 正常系")?.dynamic).toBe(false);
  });

  it("行番号を持つ", async () => {
    const [file] = await extractGoTestCases([{ path: "a_test.go", content: SRC }]);
    expect(file.cases.find((c) => c.names.join(" > ") === "TestCreate")?.line).toBe(5);
    expect(file.cases.find((c) => c.names.join(" > ") === "TestCreate > 正常系")?.line).toBe(6);
  });

  it("構文エラーのファイルは cases を空にして返す", async () => {
    const [file] = await extractGoTestCases([{ path: "broken_test.go", content: "package x\nfunc (" }]);
    expect(file.cases).toEqual([]);
  });
});
