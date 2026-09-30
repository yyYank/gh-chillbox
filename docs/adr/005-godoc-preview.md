# ADR-005: PRのGoパッケージdocをシンボル単位の差分で表示する

## ステータス

Accepted

## Context

GoのPRでは、export された関数・型・メソッドのシグネチャやdocコメントの変更が、パッケージ利用者への影響になる。diffからこれを拾うには、private な変更や実装の変更と見分けながら読む必要がある。

## Decision

`go/doc` を使ってexportされたシンボルのdocを抽出し、Insightの「godoc」サブタブで、PRのmerge-baseとheadをシンボル単位で比較して表示する。

主な設計判断:

- **抽出**: `server/tools/godoc/` のGoツールで `go/doc` を使う。`go doc` と同じ解釈になり、privateな関数・メソッド・型・structフィールドは出さない。`_test.go` と構文エラーのファイルは対象外
- **入力**: ファイルの中身をstdinのJSONで渡す。merge-baseの版も `git show` で取り出したものを一時ファイルなしで渡せる
- **出力**: シンボルごとに kind（const / var / type / func / method）、名前（メソッドは `Type.Method`）、本体を除いたシグネチャ、docのテキストとHTML
- **差分**: kind+名前で突き合わせ、追加 / 変更 / 削除を判定する。変更はシグネチャとdocのどちらが変わったかも返す。パッケージはディレクトリ+パッケージ名で突き合わせる
- **対象パッケージ**: 「差分」はPRで .go ファイルが変わったディレクトリのみ。「全部」は切り替えたときに初めて取得し、`vendor/` と `testdata/` は除く
- **API**: `GET /api/godoc?repo=&number=&scope=changed|all`

## Consequences

- レビュアーは、パッケージの公開APIとして何が変わったかを実装のdiffと分けて把握できる
- 変更前のシグネチャは返していないため、「変更」は変わった項目名だけを表示する
- 表示にはサーバー側で `go` コマンドが必要（初回にツールをbuildする）
- docのHTMLは `go/doc` の出力をそのまま表示する

## 今後の整理

- `openapi-collect.ts` と `godoc-collect.ts` に同じ `gitOutput` があるため、`repo-cache.ts` などに共通化する
- OpenAPIタブとgodocタブの「差分 / 全部」切り替えと遅延取得の処理が同じ作りなので、共通の部品にする
