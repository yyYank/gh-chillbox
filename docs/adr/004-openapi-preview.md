# ADR-004: PRのOpenAPI変更をendpoint単位の差分で表示する

## ステータス

Accepted

## Context

API定義（Swagger / OpenAPI）を含むPRでは、YAML/JSONのdiffから「どのendpointが増えた・変わった・消えたか」を読み取る必要がある。`$ref` で分割されたスキーマや、ファイル全体の並び替えがあると、テキストdiffだけではAPIとしての変更点が見えにくい。

Swagger UI / Redocの利用も検討したが、見た目をアプリに合わせにくく、PRの差分とも結びつけられないため採用しなかった。

## Decision

OpenAPIの表示部品を自作し、Insightの「OpenAPI」サブタブで、PRのmerge-baseとheadをendpoint単位で比較して表示する。

主な設計判断:

- **対象ファイルの判定**: ファイル名ではなく中身で判定する。`git ls-files` 上の yaml/yml/json のうち、先頭4KBにトップレベルの `openapi:` / `swagger:` キーがあるものだけをパースする。5MBを超えるファイルは対象外
- **正規化**: Swagger 2.0 と OpenAPI 3.x を同じendpoint一覧の形（method / path / parameters / requestBody / responses）にそろえる。2.0 の body parameter は requestBody に寄せる
- **`$ref` 展開**: 同一ファイル内の `#/...` 参照だけを展開する。循環参照は `$ref` のまま残す。外部ファイル参照は展開しない
- **差分**: method+path でendpointを突き合わせ、追加 / 変更 / 削除を判定する。変更は parameters・requestBody・responses など、どの項目が変わったかも返す。キー順だけの違いは変更とみなさない。比較対象はbaseブランチの先端ではなくmerge-base
- **取得範囲**: 最初は「差分」（PRで変更されたファイルのみ）を取得し、「全部」は切り替えたときに初めて取得する
- **API**: `GET /api/openapi?repo=&number=&scope=changed|all`

## Consequences

- レビュアーはYAMLのdiffを読まずに、APIとして何が変わったかを把握できる
- Try it out（その場でAPIを呼ぶ機能）は提供しない
- 外部ファイル参照（`other.yaml#/...`）を使うspecは、参照先のスキーマが表示されない
- ファイル名の変更は突き合わせないため、リネームされたspecは「削除」と「追加」として表示される
