# ADR-002: AST Analysis — PRで変更されたシンボルを構造的に解析する

## ステータス

実装済み（既知の不具合あり: キャッシュ形式の互換性問題）

## 背景

Change Surface（ADR-001）でPRの変更範囲を大まかに把握できるが、どの関数・コンポーネント・Hookが変更されたかまではdiffだけでは正確に把握できない。PRを理解するときの「ファイルを開いてコード構造を頭の中で再構築する作業」を減らしたい。

## 決定

`gh pr diff`で変更箇所を特定し、ローカルにcloneしたRepositoryのASTと照合することで、変更行をSymbol単位へマッピングする。Change Surfaceより高度なOptional Analysisとして実装する。

```
PR Diff → 変更ファイル → 変更行 → AST → Changed Symbols
```

## 対象言語

初期実装では以下に限定。その他の言語はfallbackとしてファイル単位の表示を維持する。

- TypeScript / TSX / JavaScript / JSX
- Go

## アーキテクチャ

### 全体フロー

```
AstAnalysis.tsx (クライアント)
  ↓ fetch /api/ast-analysis?repo=X&number=N
server/index.ts (APIエンドポイント)
  ↓ import("./ast-analyzer")
server/ast-analyzer.ts (オーケストレーター)
  ├── gh pr view → headRefOid (SHA取得)
  ├── analysis-cache.ts → キャッシュ確認
  ├── gh pr diff → diff取得
  ├── diff-parser.ts → 変更行番号抽出
  ├── repo-cache.ts → リポジトリclone/fetch/checkout
  ├── ast-ts.ts → TypeScript AST解析 (ts-morph)
  └── ast-go.ts → Go AST解析 (go/parser via Go CLI)
```

## データモデル

```ts
type SymbolKind =
  | "function" | "method" | "class" | "component"
  | "hook" | "interface" | "type" | "struct" | "unknown"

type ChangedSymbol = {
  id: string       // `${file}:${name}`
  name: string
  kind: SymbolKind
  file: string
  startLine: number
  endLine: number
  changedLines: number[]
}

type SymbolRelation = {
  from: string
  to: string
  kind: "call" | "component-use" | "hook-use" | "method-call"
}

type AstAnalysisResult = {
  symbols: ChangedSymbol[]
  relations: SymbolRelation[]
}
```

## Diff → Symbol Mapping

`gh pr diff`から変更された行番号を取得する（`diff-parser.ts`）。追加行（`+`で始まる行）のみを新ファイル上の行番号として記録する。

ASTから各Symbolの開始行・終了行を取得し、変更行がSymbolの範囲内に存在する場合、そのSymbolをChanged Symbolとして扱う。

```
変更行 42-57 ∈ Symbol範囲 30-65 → Symbol changed
```

## TypeScript / React解析

ts-morphを使用。

### 取得するSymbol

| 対象 | kind | 判定方法 |
|---|---|---|
| 名前付き関数宣言 | `function` | `getFunctions()` |
| アロー関数/関数式（変数宣言） | `function` | `getVariableStatements()` → initializer判定 |
| React Component | `component` | PascalCase名 + JSX/createElement含有 |
| Custom Hook | `hook` | `/^use[A-Z]/` にマッチ |
| クラス | `class` | `getClasses()` |
| クラスメソッド | `method` | `getMethods()` |
| インターフェース | `interface` | `getInterfaces()` |
| 型エイリアス | `type` | `getTypeAliases()` |

### 取得するRelation

| 種類 | kind | 検出方法 |
|---|---|---|
| 関数呼び出し | `call` | `CallExpression` + `Identifier` |
| Hook使用 | `hook-use` | `CallExpression` + `use[A-Z]`名 |
| メソッド呼び出し | `method-call` | `CallExpression` + `PropertyAccessExpression` |
| コンポーネント使用 | `component-use` | `JsxOpeningElement` / `JsxSelfClosingElement` |

Relationは同一ファイル内のSymbol間でのみ検出される。重複排除は`from:to:kind`のキーで行う。

## Go解析

`server/tools/ast-go-parser.go`としてGoのCLIツールを実装。`go/parser`と`go/ast`を使用し、`go run .`で実行する（タイムアウト30秒）。

### 取得するSymbol

| 対象 | kind |
|---|---|
| `*ast.FuncDecl`（receiverなし） | `function` |
| `*ast.FuncDecl`（receiverあり） | `method` |
| `*ast.TypeSpec` → struct | `struct` |
| `*ast.TypeSpec` → interface | `interface` |
| その他の`*ast.TypeSpec` | `type` |

### 取得するRelation

- `*ast.CallExpr` → `*ast.Ident`: `call`
- `*ast.CallExpr` → `*ast.SelectorExpr`: `method-call`

Go parserがエラーを返した場合は`{symbols: [], relations: []}`を静かに返す（サイレントフォールバック）。

## 未対応言語のfallback

対応言語以外のファイルは、ファイル単位で`kind: "unknown"`のSymbolを生成する。UIでは`"File"`として表示される。`startLine`/`endLine`は`0`。

## Repository Cache

AST解析には対象Repositoryのcheckoutが必要。`.cache/repos/<owner>/<repo>/`にcloneを保持する。

- 初回: `git clone --filter=blob:none`（blobless clone）
- 2回目以降: `git fetch` → `git checkout <SHA>`
- キャッシュは完全にdisposable

### Analysis Cache

AST解析結果はcommit SHA単位でキャッシュする。`.cache/analysis/<owner>/<repo>/<sha>.json`に保存。

### 既知の不具合: キャッシュ形式の互換性

relations機能追加（commit `017e399`）以前に生成されたキャッシュは配列形式（`[...]`）で保存されている。現在のコードは`{symbols: [...], relations: [...]}`形式を期待するため、旧キャッシュがヒットすると`d.symbols`が`undefined`となり「変更されたシンボルなし」と表示される。

修正: `getAnalysisCache`でキャッシュ形式をバリデーションし、`symbols`/`relations`キーがなければキャッシュミスとして扱う。

## Relation フィルタリング

Relationは2段階でフィルタリングされる。

1. **サーバー側**（`ast-analyzer.ts`）: Changed Symbolの名前を含むrelationのみ保持（`from`または`to`がChanged Symbol）
2. **クライアント側**（`AstAnalysis.tsx`の`buildFlowChains`）: `from`と`to`の両方がChanged Symbolであるrelationのみ使用（より厳密）

## UI表示

### Changed Symbols

ファイルごとにグループ化し、各Symbolを色付きドット・名前・kind・行範囲で表示。

### Call Flow

Changed Symbol間のrelationからDAGを構築し、root（incoming edgeなし + outgoing edgeあり）から辿ってチェーン表示。`A → B → C`形式。循環はvisitedセットで打ち切り。

### Relations

`X calls/renders/uses Y`の形式でフラットリスト表示。

## 実装ファイル

| ファイル | 役割 |
|---|---|
| `server/ast-types.ts` | 共有型定義 |
| `server/ast-analyzer.ts` | オーケストレーター |
| `server/ast-ts.ts` | TypeScript/TSX AST解析 |
| `server/ast-ts.test.ts` | TypeScript解析のテスト |
| `server/ast-go.ts` | Go AST解析（CLIラッパー） |
| `server/ast-go.test.ts` | Go解析のテスト |
| `server/diff-parser.ts` | diff → 変更行番号 |
| `server/diff-parser.test.ts` | diffパーサーのテスト |
| `server/repo-cache.ts` | リポジトリclone/fetch管理 |
| `server/analysis-cache.ts` | 解析結果キャッシュ |
| `server/tools/ast-go-parser.go` | Go AST解析CLI |
| `src/AstAnalysis.tsx` | UIコンポーネント |

## 設計上の注意点

- 型定義がサーバー（`ast-types.ts`）とクライアント（`AstAnalysis.tsx`）で重複している。共有型パッケージは未導入。
- `extractRelationsFromFile`は内部で`extractSymbolsFromFile`を再度呼び出しており、1ファイルにつきts-morphのProjectを2回作成している。
- Go解析は`go run .`で毎回コンパイルするため、初回は遅い。事前ビルドは未実装。

## 対象外

- 完全なSemantic Analysis
- Runtime Behavior解析
- Dynamic Dispatchの完全な解決
- 全言語対応
- LLMによるコード理解
- クロスファイルのRelation検出（現在は同一ファイル内のみ）
