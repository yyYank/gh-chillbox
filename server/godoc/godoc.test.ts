import { describe, it, expect } from "vitest";
import { extractGoDocs } from "./godoc";

const SRC = `// Package user は利用者を扱う。
package user

// MaxName は名前の最大長。
const MaxName = 64

// User は利用者。
type User struct {
	// Name は表示名。
	Name string
	secret string
}

// NewUser は User を作る。
func NewUser(name string) *User { return &User{Name: name} }

// Rename は名前を変える。
func (u *User) Rename(name string) error { return nil }

func (u *User) validate() bool { return true }

func helper() {}
`;

describe("extractGoDocs", () => {
  it("パッケージ名と doc コメントを取り出す", async () => {
    const [pkg] = await extractGoDocs([{ dir: "internal/user", files: [{ name: "user.go", content: SRC }] }]);
    expect(pkg.dir).toBe("internal/user");
    expect(pkg.name).toBe("user");
    expect(pkg.docText).toBe("Package user は利用者を扱う。\n");
  });

  it("export されたシンボルだけを kind・名前つきで返し、private な関数・メソッドは含めない", async () => {
    const [pkg] = await extractGoDocs([{ dir: "u", files: [{ name: "user.go", content: SRC }] }]);
    expect(pkg.items.map((i) => [i.kind, i.name])).toEqual([
      ["const", "MaxName"],
      ["type", "User"],
      ["func", "NewUser"],
      ["method", "User.Rename"],
    ]);
  });

  it("関数は本体なしの signature を decl に入れ、doc コメントも持つ", async () => {
    const [pkg] = await extractGoDocs([{ dir: "u", files: [{ name: "user.go", content: SRC }] }]);
    const newUser = pkg.items.find((i) => i.name === "NewUser");
    expect(newUser?.decl).toBe("func NewUser(name string) *User");
    expect(newUser?.docText).toBe("NewUser は User を作る。\n");
    expect(newUser?.docHtml).toContain("<p>NewUser は User を作る。");
  });

  it("struct の private フィールドは decl に出さない", async () => {
    const [pkg] = await extractGoDocs([{ dir: "u", files: [{ name: "user.go", content: SRC }] }]);
    const user = pkg.items.find((i) => i.name === "User");
    expect(user?.decl).toContain("Name string");
    expect(user?.decl).not.toContain("secret");
  });

  it("_test.go は対象外にする", async () => {
    const testSrc = "package user\n\n// TestOnly はテスト用。\nfunc TestOnly() {}\n";
    const [pkg] = await extractGoDocs([{
      dir: "u",
      files: [{ name: "user.go", content: SRC }, { name: "user_test.go", content: testSrc }],
    }]);
    expect(pkg.items.map((i) => i.name)).not.toContain("TestOnly");
  });

  it("構文エラーのファイルは飛ばし、残りのファイルで抽出する", async () => {
    const [pkg] = await extractGoDocs([{
      dir: "u",
      files: [{ name: "user.go", content: SRC }, { name: "broken.go", content: "package user\nfunc (" }],
    }]);
    expect(pkg.items.map((i) => i.name)).toContain("NewUser");
  });
});
