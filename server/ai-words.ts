import type { Detection } from "./textlint";

// preset-ai-words-ja が指摘する語のうち、文脈に依らず機械的に置換できるものだけを持つ。
// 活用する動詞（効く・走る等）は表層形が辞書形と一致しないので、ここでは扱わない。
export const REPLACEMENTS: Record<string, string> = {
  部品: "部分",
  検査: "チェック",
  事故: "障害",
  漏れ: "抜け",
  穴: "抜け",
  核心: "要点",
  帰結: "結果",
  構図: "構造",
  既定では: "デフォルトでは",
  実測: "実際に計測",
  照合: "比較",
  死活: "稼働",
  線引き: "区別",
  素通り: "通過",
  道具: "ツール",
  定番: "よくある",
  定石: "基本的なやり方",
  土台: "基礎",
  落とし穴: "注意点",
  黙って: "何も知らせずに",
  無差別: "手当たり次第",
  断定: "言い切り",
  門: "ゲート",
  原料: "元データ",
  破綻: "不整合",
  無言: "通知なし",
  静かに: "そのまま",
  正典: "正式",
  正本: "SSOT",
  原初: "オリジナル",
  効く: "効果的",
};

// 「〜から引く」のように複数語にまたがる指摘。検出位置から始まる表層形で照合する。
// 長い表層形を先に並べる（「から引き」より「から引きます」を優先）。
export const PHRASE_REPLACEMENTS: Record<string, [string, string][]> = {
  "〜から引く": [
    ["から引きます", "から取得します"],
    ["から引いた", "から取得した"],
    ["から引いて", "から取得して"],
    ["から引く", "から取得する"],
    ["から引き", "から取得し"],
  ],
  "〜に落ちる": [
    ["に落ちました", "になりました"],
    ["に落ちます", "になります"],
    ["に落ちた", "になった"],
    ["に落ちて", "になって"],
    ["に落ちる", "になる"],
  ],
};

export type Replacement = { from: string; to: string; index: number };

export type ReplaceResult = {
  rewritten: string;
  replaced: Replacement[];
};

/**
 * textlint の検出位置をもとに、辞書にある語だけを置換する。
 * 表層形が辞書形と一致しない指摘（活用した動詞など）は置換せずに残す。
 */
export function replaceAiWords(text: string, detections: Detection[]): ReplaceResult {
  const replaced: Replacement[] = [];
  let rewritten = text;

  // 後ろから置換して、前方の index がずれないようにする
  const ordered = [...detections].sort((a, b) => b.index - a.index);
  for (const d of ordered) {
    const exact = REPLACEMENTS[d.word];
    if (exact && rewritten.startsWith(d.word, d.index)) {
      rewritten =
        rewritten.slice(0, d.index) + exact + rewritten.slice(d.index + d.word.length);
      replaced.push({ from: d.word, to: exact, index: d.index });
      continue;
    }

    const phrase = PHRASE_REPLACEMENTS[d.word]?.find(([surface]) =>
      rewritten.startsWith(surface, d.index),
    );
    if (phrase) {
      const [surface, to] = phrase;
      rewritten =
        rewritten.slice(0, d.index) + to + rewritten.slice(d.index + surface.length);
      replaced.push({ from: surface, to, index: d.index });
    }
  }

  return { rewritten, replaced: replaced.reverse() };
}
