import { untrustedRule } from "./untrusted";

// ルールはユーザーメッセージではなくシステムプロンプトに置き、PR 本文などに書かれた指示より優先させる
export function chatSystemPrompt(nonce: string): string {
  return [
    "## PR についての質問への回答ルール",
    untrustedRule(nonce),
    "- 必ずコードを読んでから答える。カレントディレクトリはPRのheadをcheckoutしたリポジトリ",
    "- PR本文やdiffだけを根拠に結論を出さない",
    "- 影響を答えるときは、画面から部品に渡される値までたどって実際に表示・実行されるかを確かめる",
    "- コードを読めないときは「読めていないので判断できない」と答える",
  ].join("\n");
}
