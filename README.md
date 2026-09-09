# gh-chillbox

A chill place to manage your GitHub notifications, TODOs, reviews, and PRs.
GitHub の通知、TODO、レビュー、Pull Request を、落ち着いて整理するためのローカル専用ダッシュボードです。

## モチベーション
GitHub の Inbox は通知を集約してくれますが、実際に使っていると「自分が今対応すべきもの」が見つけにくいです。
`@mention`、Review Request、Issue、Pull Request、CI や状態変更などが同じ Inbox に流れ込み、すでにマージ済み・クローズ済みのものも混ざるため、Slack の Mentions のように「自分への未処理メッセージだけを見る」という使い方がしづらくなっています。
また、Pull Request を複数抱えていると、単に Open PR の一覧を見るだけでは不十分です。
- どの PR を先にレビューするべきか
- どの PR を先にマージしたいか
- 今は対応できないので後回しにしたい PR はどれか
- この PR について自分が何を確認したかったのか
- 誰かの返答待ちなのか、自分の作業待ちなのか
といった個人的な優先順位やメモを GitHub 上だけで管理するのは意外と面倒です。
gh-chillbox は、GitHub を新しい通知システムに置き換えるのではなく、GitHub 上にある情報を自分向けに整理し直すことを目的としています。
通知に常時反応するのではなく、必要なときに gh-chillbox を開き、未読、TODO、レビュー対象、マージ候補を確認して、自分のペースで処理できる状態を作ります。
## コンセプト
gh-chillbox は、GitHub の Notifications と Pull Request を、自分用の Inbox + TODO リストとして扱うための小さなローカルツールです。
GitHub との通信には既存の `gh` CLI を利用し、GitHub 上のデータはできるだけそのまま利用します。
一方で、TODO、優先度、メモ、既読状態、Snooze などの個人的な管理情報はローカルに保存します。
## 主な機能
- GitHub Notifications の一覧表示
- 未読通知の管理
- `@mention` や Review Request の確認
- Open な Pull Request の一覧表示
- Issue / Pull Request の個人 TODO 管理
- PR ごとの優先順位管理
- レビュー優先度の管理
- マージ優先度の管理
- PR / Issue ごとの個人メモ
- Done / Ignore / Snooze などのローカル状態管理
- GitHub 側の最新状態を手動で再取得
- 既存の `gh auth` をそのまま利用
## 技術スタック
- Vite
- React
- TypeScript
- Node.js
- Server Actions 相当のローカル API
- GitHub CLI (`gh`)
- `gh api`
- localStorage
フロントエンドは Vite + React で構築します。
GitHub API をブラウザから直接呼ぶのではなく、ローカルで動く Node.js 側の処理を経由して `gh api` や `gh pr` などのコマンドを実行します。
React 側からは Server Actions のような感覚でローカル API を呼び出し、GitHub の認証情報は `gh` CLI に任せます。
TODO、既読状態、優先度、メモ、Snooze など、GitHub に保存する必要のない個人的な状態は `localStorage` に保存します。
## 方針
GitHub に常に注意を奪われないことを重視します。
通知が来るたびに反応するのではなく、gh-chillbox を必要なときだけ開き、今見るべきもの、レビューすべきもの、マージすべきものを整理して処理する。
GitHub と少し距離を置いて作業するためのツールです。
