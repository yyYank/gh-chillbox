# ADR-006: PRのテストケース名をunit / e2eに分けて差分表示する

## ステータス

Accepted

## Context

PRレビューでは「何をテストしているか」「どのテストが増えた・消えた・skipされたか」を確認したい。テストコードのdiffは実装の詳細が多く、テストケース名の増減だけを追うのは難しい。

対象のコードベースは、Goのテスト、jest / vitestのunitテスト、Playwrightのe2eテスト、Gherkinの `.feature` などが混在する。Gherkinを使わず、Playwrightで `describe` / `it` 形式のe2eを書いているコードベースもある。

## Decision

Go・TS/JS・Gherkinのテストケース名を抽出し、Insightの「Tests」サブタブで、PRのmerge-baseとheadをテストケース単位で比較して表示する。

主な設計判断:

- **テストファイルの判定**: Goは `_test.go`、TS/JSは `.test.` / `.spec.` を含むファイルか `__tests__/` 配下、Gherkinは `.feature`。Cypress（`.cy.ts`）は対象外
- **Goの抽出**: `server/tools/gotests/` のGoツールで、`Test` / `Benchmark` / `Fuzz` 関数と入れ子の `Run` を取り出す。`go test` と同じく、接頭辞の直後が小文字の関数（`Testhelper` など）は対象外。`t` 以外の引数名（`tt` など）でも入れ子を追う
- **TS/JSの抽出**: ts-morphで `describe` / `it` / `test` / `test.describe` を入れ子の名前つきで取り出す。`.skip` / `.only` / `.todo` / `.each` / `.serial` や `x` / `f` 接頭辞は修飾として残す。`test.step`、フック、関数を渡さない `test.skip(cond)` は対象外。`@playwright/test` をimportしているファイルをPlaywrightとみなす
- **Gherkinの抽出**: ライブラリを使わず行ごとに読み、`Feature` / `Rule` / `Scenario` / `Scenario Outline` を取り出す。日本語キーワード（`機能` / `シナリオ` など）にも対応する。タグは修飾として残し、`Examples` の行は展開しない。DocStringの中は無視する
- **名前が実行時に決まるテスト**: `t.Run(tc.name)` やテンプレート文字列のように名前が式で決まる場合は、式をそのまま名前にし、dynamicの印を付ける
- **unit / e2e**: PlaywrightとGherkinをe2e、Goとjest / vitestをunitとする
- **差分**: ファイルごとに、kind+名前のパスで突き合わせ、追加 / 削除を判定する。修飾（skipなど）だけが変わったものは変更とし、行番号だけの変化は無視する。同じ名前のテストが複数あれば出現順に1対1で突き合わせる
- **取得範囲**: 最初は「差分」（PRで変更されたテストファイルのみ）を取得し、「全部」は切り替えたときに初めて取得する
- **API**: `GET /api/test-cases?repo=&number=&scope=changed|all`

## Consequences

- レビュアーは、テストコードを読まずに、テストケースの増減とskipなどの変化を把握できる
- テストケース名が変わると「削除」と「追加」として表示される。名前の変更を追うより、見落としにくさを優先した
- テーブル駆動テストの各ケースは実行時に決まるため、個々のケース名は取得できない
- Playwrightをimportせずに独自のfixtureを経由している場合は、e2eではなくunitとして分類される
- 表示にはサーバー側で `go` コマンドが必要（初回にツールをbuildする）

## 今後の整理

- `gitOutput` が `openapi-collect.ts`・`godoc-collect.ts`・`test-cases-collect.ts` で重複している
- Goツールのbuildと実行の処理が `godoc.ts` と `test-cases-go.ts` で重複している
- 「差分 / 全部」の切り替えと遅延取得の処理が、OpenAPI・godoc・Testsの3タブで重複している
