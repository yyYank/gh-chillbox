import { describe, it, expect } from "vitest";
import { replaceAiWords } from "./ai-words";
import type { Detection } from "./textlint";

const det = (word: string, index: number): Detection => ({
  index,
  line: 1,
  column: index + 1,
  word,
  message: `"${word}" はAIが書いた文章で多用される表現です。`,
});

describe("replaceAiWords", () => {
  it("辞書にある語を置換する", () => {
    const text = "既存の部品を再利用した";
    const r = replaceAiWords(text, [det("部品", 3)]);
    expect(r.rewritten).toBe("既存の部分を再利用した");
    expect(r.replaced).toEqual([{ from: "部品", to: "部分", index: 3 }]);
  });

  it("複数箇所を置換しても後続のindexがずれない", () => {
    const text = "検査と部品と検査";
    const r = replaceAiWords(text, [det("検査", 0), det("部品", 3), det("検査", 6)]);
    expect(r.rewritten).toBe("チェックと部分とチェック");
    expect(r.replaced.map((x) => x.index)).toEqual([0, 3, 6]);
  });

  it("表層形が辞書形と一致しない指摘は置換しない", () => {
    const text = "パフォーマンスに効きます";
    const r = replaceAiWords(text, [det("効く", 8)]);
    expect(r.rewritten).toBe(text);
    expect(r.replaced).toEqual([]);
  });

  it("辞書に無い語は置換しない", () => {
    const text = "経路を見直す";
    const r = replaceAiWords(text, [det("経路", 0)]);
    expect(r.rewritten).toBe(text);
  });

  it("指摘が無ければ原文をそのまま返す", () => {
    const text = "ふつうの日本語";
    expect(replaceAiWords(text, []).rewritten).toBe(text);
  });
});

describe("PHRASE_REPLACEMENTS", () => {
  const det = (word: string, index: number): Detection => ({
    index, line: 1, column: index + 1, word,
    message: `"${word}" はAIが書いた文章で多用される表現です。`,
  });

  it("活用した句も表層形で置換する", () => {
    const r = replaceAiWords("DBから引いた値", [det("〜から引く", 2)]);
    expect(r.rewritten).toBe("DBから取得した値");
  });

  it("〜に落ちるを置換する", () => {
    const r = replaceAiWords("タイムアウトに落ちました", [det("〜に落ちる", 6)]);
    expect(r.rewritten).toBe("タイムアウトになりました");
  });

  it("知らない活用形は置換しない", () => {
    const text = "キャッシュから引かれる";
    expect(replaceAiWords(text, [det("〜から引く", 5)]).rewritten).toBe(text);
  });
});
