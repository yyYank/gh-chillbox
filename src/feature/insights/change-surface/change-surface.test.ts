import { describe, it, expect } from "vitest";
import {
  type FileInput,
  scoreFile,
  classifyFiles,
  computeSummary,
} from "./change-surface";

describe("scoreFile", () => {
  it("componentsディレクトリのtsxファイルをUIと判定する", () => {
    const result = scoreFile({ path: "src/components/Button.tsx", additions: 10, deletions: 5 });
    expect(result.primaryLayer).toBe("ui");
  });

  it("pagesディレクトリのファイルをUIと判定する", () => {
    const result = scoreFile({ path: "pages/index.tsx", additions: 20, deletions: 0 });
    expect(result.primaryLayer).toBe("ui");
  });

  it("routesディレクトリのファイルをAPIと判定する", () => {
    const result = scoreFile({ path: "src/routes/users.ts", additions: 30, deletions: 10 });
    expect(result.primaryLayer).toBe("api");
  });

  it("handlersディレクトリのファイルをAPIと判定する", () => {
    const result = scoreFile({ path: "handlers/auth.go", additions: 50, deletions: 0 });
    expect(result.primaryLayer).toBe("api");
  });

  it("controllersディレクトリのファイルをAPIと判定する", () => {
    const result = scoreFile({ path: "app/controllers/users_controller.rb", additions: 10, deletions: 5 });
    expect(result.primaryLayer).toBe("api");
  });

  it("domainディレクトリのファイルをDomainと判定する", () => {
    const result = scoreFile({ path: "src/domain/User.ts", additions: 15, deletions: 5 });
    expect(result.primaryLayer).toBe("domain");
  });

  it("usecaseディレクトリのファイルをDomainと判定する", () => {
    const result = scoreFile({ path: "internal/usecase/create_user.go", additions: 30, deletions: 0 });
    expect(result.primaryLayer).toBe("domain");
  });

  it("servicesディレクトリのファイルをDomainと判定する", () => {
    const result = scoreFile({ path: "src/services/auth.ts", additions: 20, deletions: 10 });
    expect(result.primaryLayer).toBe("domain");
  });

  it("repositoryディレクトリのファイルをDataと判定する", () => {
    const result = scoreFile({ path: "src/repository/UserRepo.ts", additions: 10, deletions: 5 });
    expect(result.primaryLayer).toBe("data");
  });

  it("daoディレクトリのファイルをDataと判定する", () => {
    const result = scoreFile({ path: "dao/user_dao.go", additions: 25, deletions: 5 });
    expect(result.primaryLayer).toBe("data");
  });

  it("migrationsディレクトリのファイルをDBと判定する", () => {
    const result = scoreFile({ path: "db/migrations/001_create_users.sql", additions: 30, deletions: 0 });
    expect(result.primaryLayer).toBe("db");
  });

  it("schema.sqlをDBと判定する", () => {
    const result = scoreFile({ path: "schema.sql", additions: 10, deletions: 0 });
    expect(result.primaryLayer).toBe("db");
  });

  it(".test.tsファイルをTestと判定する", () => {
    const result = scoreFile({ path: "src/utils/calc.test.ts", additions: 50, deletions: 0 });
    expect(result.primaryLayer).toBe("test");
  });

  it(".spec.tsファイルをTestと判定する", () => {
    const result = scoreFile({ path: "src/utils/calc.spec.ts", additions: 50, deletions: 0 });
    expect(result.primaryLayer).toBe("test");
  });

  it("_test.goファイルをTestと判定する", () => {
    const result = scoreFile({ path: "internal/handler/auth_test.go", additions: 50, deletions: 0 });
    expect(result.primaryLayer).toBe("test");
  });

  it("package.jsonをConfigと判定する", () => {
    const result = scoreFile({ path: "package.json", additions: 5, deletions: 2 });
    expect(result.primaryLayer).toBe("config");
  });

  it("tsconfig.jsonをConfigと判定する", () => {
    const result = scoreFile({ path: "tsconfig.json", additions: 3, deletions: 1 });
    expect(result.primaryLayer).toBe("config");
  });

  it("go.modをConfigと判定する", () => {
    const result = scoreFile({ path: "go.mod", additions: 2, deletions: 1 });
    expect(result.primaryLayer).toBe("config");
  });

  it(".mdファイルをDocsと判定する", () => {
    const result = scoreFile({ path: "README.md", additions: 10, deletions: 5 });
    expect(result.primaryLayer).toBe("docs");
  });

  it("判定できないファイルをOtherにする", () => {
    const result = scoreFile({ path: "Makefile", additions: 5, deletions: 0 });
    expect(result.primaryLayer).toBe("other");
  });

  it("changedLinesがadditions + deletionsになる", () => {
    const result = scoreFile({ path: "src/App.tsx", additions: 10, deletions: 5 });
    expect(result.changedLines).toBe(15);
  });
});

describe("scoreFile with diff keywords", () => {
  it("CREATE TABLEを含むdiffでDBスコアが加算される", () => {
    const result = scoreFile(
      { path: "src/setup.ts", additions: 10, deletions: 0 },
      "CREATE TABLE users (id INT PRIMARY KEY);"
    );
    expect(result.scores.db).toBeGreaterThan(0);
  });

  it("useStateを含むdiffでUIスコアが加算される", () => {
    const result = scoreFile(
      { path: "src/utils/helper.ts", additions: 10, deletions: 0 },
      "const [count, setCount] = useState(0);"
    );
    expect(result.scores.ui).toBeGreaterThan(0);
  });

  it("routerを含むdiffでAPIスコアが加算される", () => {
    const result = scoreFile(
      { path: "src/index.ts", additions: 10, deletions: 0 },
      "const router = express.Router();"
    );
    expect(result.scores.api).toBeGreaterThan(0);
  });
});

describe("classifyFiles", () => {
  it("複数ファイルを一括分類できる", () => {
    const files: FileInput[] = [
      { path: "src/components/Button.tsx", additions: 50, deletions: 10 },
      { path: "src/api/users.ts", additions: 30, deletions: 5 },
      { path: "src/components/Button.test.tsx", additions: 20, deletions: 0 },
    ];
    const results = classifyFiles(files);
    expect(results).toHaveLength(3);
    expect(results[0].primaryLayer).toBe("ui");
    expect(results[1].primaryLayer).toBe("api");
    expect(results[2].primaryLayer).toBe("test");
  });
});

describe("computeSummary", () => {
  it("変更行数に基づいた割合を計算する", () => {
    const files: FileInput[] = [
      { path: "src/components/UserPage.tsx", additions: 100, deletions: 20 },
      { path: "src/api/users.ts", additions: 60, deletions: 20 },
    ];
    const classified = classifyFiles(files);
    const summary = computeSummary(classified);

    const ui = summary.find((s) => s.layer === "ui");
    const api = summary.find((s) => s.layer === "api");
    expect(ui).toBeDefined();
    expect(api).toBeDefined();
    expect(ui!.percentage + api!.percentage).toBe(100);
    expect(ui!.percentage).toBe(60);
    expect(api!.percentage).toBe(40);
  });

  it("割合の降順でソートされる", () => {
    const files: FileInput[] = [
      { path: "src/api/users.ts", additions: 10, deletions: 0 },
      { path: "src/components/Page.tsx", additions: 100, deletions: 0 },
    ];
    const classified = classifyFiles(files);
    const summary = computeSummary(classified);
    expect(summary[0].layer).toBe("ui");
    expect(summary[1].layer).toBe("api");
  });

  it("0%のレイヤーは含まれない", () => {
    const files: FileInput[] = [
      { path: "src/components/Page.tsx", additions: 100, deletions: 0 },
    ];
    const classified = classifyFiles(files);
    const summary = computeSummary(classified);
    expect(summary).toHaveLength(1);
    expect(summary[0].layer).toBe("ui");
  });

  it("ファイルがないとき空配列を返す", () => {
    const summary = computeSummary([]);
    expect(summary).toEqual([]);
  });
});
