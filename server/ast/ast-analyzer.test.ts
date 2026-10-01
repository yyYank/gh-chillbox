import { describe, it, expect } from "vitest";
import { detectModules, isTestOrMockFile } from "./ast-analyzer";

describe("detectModules", () => {
  it("apps/配下のファイルからモジュールを特定する", () => {
    const modules = detectModules([
      "apps/rest-api/identity_user_repo.go",
      "apps/my-app/app/users/page.tsx",
    ]);
    expect(modules).toContain("apps/rest-api");
    expect(modules).toContain("apps/my-app");
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

describe("isTestOrMockFile", () => {
  it("Go テストファイルを検出する", () => {
    expect(isTestOrMockFile("apps/rest-api/internal/handler/user_test.go")).toBe(true);
  });

  it("Go mockファイルを検出する", () => {
    expect(isTestOrMockFile("apps/rest-api/internal/infra/mock_purchase.go")).toBe(true);
    expect(isTestOrMockFile("apps/rest-api/mock_session.go")).toBe(true);
  });

  it("TSテストファイルを検出する", () => {
    expect(isTestOrMockFile("src/feature/call-graph/call-graph.test.ts")).toBe(true);
    expect(isTestOrMockFile("apps/my-app/lib/api.spec.tsx")).toBe(true);
  });

  it("__tests__ディレクトリを検出する", () => {
    expect(isTestOrMockFile("src/__tests__/utils.ts")).toBe(true);
  });

  it("test-fixturesディレクトリを検出する", () => {
    expect(isTestOrMockFile("server/test-fixtures/sample.tsx")).toBe(true);
  });

  it("tests/ディレクトリを検出する", () => {
    expect(isTestOrMockFile("apps/rest-api/tests/integration/checkout.go")).toBe(true);
  });

  it("通常のファイルはfalseを返す", () => {
    expect(isTestOrMockFile("apps/rest-api/internal/handler/user.go")).toBe(false);
    expect(isTestOrMockFile("apps/my-app/src/app/api/users/route.ts")).toBe(false);
    expect(isTestOrMockFile("packages/shared/utils.ts")).toBe(false);
  });

  it("mockを含むが通常のファイルはfalseを返す", () => {
    expect(isTestOrMockFile("apps/rest-api/internal/handler/mock_handler.go")).toBe(true);
    expect(isTestOrMockFile("apps/rest-api/internal/domain/mockable.go")).toBe(false);
  });
});
