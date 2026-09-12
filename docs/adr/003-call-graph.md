# ADR-003: PRの変更経路をCall Graphで可視化する

## ステータス

Accepted

## Context

PRレビューで認知負荷が高い作業のひとつは、「この変更がどこから始まり、何を通って、どこまで影響するのか」をdiffから頭の中で再構築すること。GitHubでは複数ファイルのdiffとしてフラットに表示されるため、レビュアーがファイル間の呼び出し関係を自分で組み立てる必要がある。

ADR-002のAST Analysisで取得済みのSymbol / Call Relationがあり、これを活用して理解コストを下げられる。

## Decision

Changed Symbolを起点として前後1〜2 hopのSubgraphだけを切り出し、PRを理解するためのCall Graphとして可視化する。Repository全体の完全なCall Graphは目的としない。

主な設計判断:

- **Subgraph抽出**: Changed Symbolから±1 hop（デフォルト）/ ±2 hop（展開時）のみ表示。巨大Graphになる場合は情報を削る
- **Confidence段階**: 静的解析の確実性に応じてedgeをhigh / medium / lowに分類する。ASTから直接解決できるcallはhigh、import/symbol情報からの推定はmedium、interface経由やHTTP推定はlow。UIではlowを弱く表示する
- **Reading Order**: Layer判定（Change Surface）とNode typeの優先順位から、PRを読む推奨順序をヒューリスティックで生成する。Schema/Type → Domain → Data → API → UI → Testの順
- **Frontend→Backend接続**: 同一Repository内でHTTPパス推定により関係を推定できる場合は、Frontend/Backendをまたいだ経路も表示する。完全に接続できない場合はedgeを生成しない
- **テストファイル**: デフォルトでは除外し、トグルで表示切替

## Consequences

- PRを開いた時点で変更の入口・中心・出口が数秒で把握でき、diffを読み始める前に全体像を掴める
- 静的解析の限界により、callback・Context・dynamic import・DI経由のcallは検出できず、false edgeやedge欠落が発生する
- Graphが大きいPRでは情報過多になるリスクがあり、hop制限とサイズ上限で対処する
- HTTP推定（low confidence）は誤接続の可能性があり、UIで明示的に区別する必要がある
