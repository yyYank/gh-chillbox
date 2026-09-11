# ADR-001: Change Surface — PRがどのレイヤーを変更しているか可視化する

## ステータス

実装済み

## 背景

PRの変更行数や変更ファイル一覧だけでは、そのPRが「システムのどの領域を変更しているのか」を把握しにくい。

同じ500行の変更でも、UIだけの変更、API + Domainの変更、DB Migrationを含む変更、Test中心の変更では、レビュー時に理解すべき範囲や認知負荷が大きく異なる。

PRを開いた時点で「この変更がどのレイヤーに広がっているか」を把握できるようにしたい。

## 決定

`gh pr diff`に含まれる情報（ファイルパス、ファイル名、拡張子、diff内容）から、変更されたコードをヒューリスティックに分類する。RepositoryのcloneやAST解析を必要とせず、`gh pr diff`だけで完結する軽量な分析とする。

## レイヤー定義

以下の9レイヤーで分類する。

```ts
type Layer = "ui" | "api" | "domain" | "data" | "db" | "test" | "config" | "docs" | "other"
```

### 設計判断: Mixed レイヤーについて

当初の仕様では複数レイヤーのscoreが近い場合に`Mixed`とする案があったが、実装では採用していない。最もscoreが高いレイヤーを常にprimary layerとし、PRレベルの割合表示（複数レイヤーのパーセンテージ）で横断度を表現している。

## スコアリングルール

ファイルごとに各レイヤーのscoreを持たせ、4段階のルールで加算する。

### 1. パスルール（PATH_RULES）— 12ルール

| パスパターン | レイヤー | weight |
|---|---|---|
| `components/`, `views/`, `widgets/` | ui | +3 |
| `pages/` | ui | +2 |
| `routes/`, `handlers/`, `controllers/`, `endpoints/`, `middleware/` | api | +3 |
| `api/` | api | +2 |
| `domain/`, `entities/` | domain | +3 |
| `usecase/`, `usecases/`, `use-cases/`, `use_cases/`, `interactors/` | domain | +3 |
| `services/`, `service/` | domain | +2 |
| `repository/`, `repositories/`, `repo/` | data | +3 |
| `dao/`, `daos/`, `store/`, `stores/`, `datasource/` | data | +3 |
| `migrations/`, `migrate/`, `seeds/` | db | +5 |
| `__tests__/` | test | +4 |
| `docs/`, `documentation/` | docs | +3 |

### 2. ファイル名ルール（FILENAME_RULES）— 17ルール

| パターン | レイヤー | weight |
|---|---|---|
| `.test.[jt]sx?`, `.spec.[jt]sx?` | test | +5 |
| `_test.go` | test | +5 |
| `schema.sql` | db | +5 |
| `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` | config | +3 |
| `tsconfig*.json`, `go.mod`, `go.sum`, `Cargo.toml`, `Cargo.lock` | config | +3 |
| `.eslintrc`, `.prettierrc` | config | +3 |
| `vite.config.*`, `webpack.config.*` | config | +3 |
| `Dockerfile`, `docker-compose` | config | +3 |

### 3. 拡張子ルール（EXTENSION_RULES）— 8ルール

| 拡張子 | レイヤー | weight |
|---|---|---|
| `.tsx`, `.jsx` | ui | +1 |
| `.css`, `.scss`, `.vue`, `.svelte` | ui | +2 |
| `.sql` | db | +2 |
| `.md`, `.mdx` | docs | +3 |

### 4. キーワードルール（KEYWORD_RULES）— 10ルール

diff本文の特徴語から補助的にscoreを加算する。パス・ファイル名より低いweightを使用。

| キーワード | レイヤー | weight |
|---|---|---|
| `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE` | db | +2 |
| `useState`, `useEffect`, `useCallback`, `className` | ui | +1 |
| `router`, `endpoint`, `middleware` | api | +1 |

### 現在の制限

`classifyFiles`はオプショナルな`diffMap: Map<string, string>`を受け付けるが、UIコンポーネント（`ChangeSurface.tsx`）からはdiff内容を渡していない。キーワードルールは現時点ではUI経由では機能しない。

## Layer判定

最もscoreが高いレイヤーをprimary layerとする。すべてのscoreが0の場合は`other`とする。

## Change Surfaceの集計

ファイル数ではなく、変更行数（additions + deletions）をweightとして割合を計算する。

```
percentage = Math.round((layerLines / totalLines) * 100)
```

0%のレイヤーは除外し、割合の降順でソートする。

## UI表示

### バーチャート

各レイヤーをラベル・バー・パーセンテージで表示する。バーの幅は最大のレイヤーに対する相対値（最大バーが100%幅になるスケーリング）。

### フローダイアグラム

2レイヤー以上がある場合、割合の降順で`Layer1 → Layer2 → Layer3`のチェーン表示。各レイヤーは固有の色で表示。

### デバッグ表示

トグルボタンで、ファイルごとのパス・レイヤーバッジ・変更行数のテーブルを表示可能。

## 実装ファイル

| ファイル | 役割 |
|---|---|
| `src/change-surface.ts` | スコアリングロジック、型定義、集計 |
| `src/change-surface.test.ts` | テスト（21ケース、4 describeブロック） |
| `src/ChangeSurface.tsx` | UIコンポーネント |

## テストカバレッジ

- `scoreFile`: 16テスト（全レイヤータイプのカバー）
- `scoreFile with diff keywords`: 3テスト
- `classifyFiles`: 1テスト
- `computeSummary`: 4テスト（割合計算、ソート順、0%除外、空入力）

## 拡張性

将来的にRepositoryごとのルールを上書きできるようにする余地を残している（例: YAML形式のカスタムルール）。ただし初期実装では未実装。

## 対象外

- AST解析（ADR-002で別途実装）
- Call Graph / Dependency Graph
- Repository clone
- LLMによる分類
