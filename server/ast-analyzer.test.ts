import { describe, it, expect } from "vitest";
import { detectModules } from "./ast-analyzer";

describe("detectModules", () => {
  it("apps/配下のファイルからモジュールを特定する", () => {
    const modules = detectModules([
      "apps/rest-api/identity_user_repo.go",
      "apps/wizfan-ops/app/users/page.tsx",
    ]);
    expect(modules).toContain("apps/rest-api");
    expect(modules).toContain("apps/wizfan-ops");
    expect(modules.length).toBe(2);
  });

  it("packages/配下のファイルからモジュールを特定する", () => {
    const modules = detectModules(["packages/shared/utils.ts"]);
    expect(modules).toContain("packages/shared");
  });

  it("cmd/配下のファイルからモジュールを特定する", () => {
    const modules = detectModules(["cmd/server/main.go"]);
    expect(modules).toContain("cmd/server");
  });

  it("internal/配下のファイルからモジュールを特定する", () => {
    const modules = detectModules(["internal/auth/handler.go"]);
    expect(modules).toContain("internal/auth");
  });

  it("パターンに当てはまらないファイルはルートモジュールとして扱う", () => {
    const modules = detectModules(["main.go", "config.ts"]);
    expect(modules).toContain(".");
    expect(modules.length).toBe(1);
  });

  it("重複するモジュールは1つにまとめる", () => {
    const modules = detectModules([
      "apps/rest-api/handler.go",
      "apps/rest-api/repo.go",
    ]);
    expect(modules).toEqual(["apps/rest-api"]);
  });

  it("複数種別が混在する場合すべて検出する", () => {
    const modules = detectModules([
      "apps/frontend/page.tsx",
      "internal/auth/handler.go",
      "main.go",
    ]);
    expect(modules).toContain("apps/frontend");
    expect(modules).toContain("internal/auth");
    expect(modules).toContain(".");
  });
});
