import { describe, it, expect } from "vitest";
import { splitLongSections, stepSlide, withMarpDirective } from "./diff-marp";

describe("withMarpDirective", () => {
  it("front matter がない md の先頭に marp: true と headingDivider: 2 の front matter を付け足す", () => {
    expect(withMarpDirective("# Title\n\n## Next")).toBe(
      "---\nmarp: true\nheadingDivider: 2\n---\n\n# Title\n\n## Next",
    );
  });

  it("既存の front matter があれば、その中に marp: true と headingDivider: 2 を追加する", () => {
    expect(withMarpDirective("---\ntheme: gaia\n---\n# Title")).toBe(
      "---\nmarp: true\nheadingDivider: 2\ntheme: gaia\n---\n# Title",
    );
  });

  it("marp: true だけがある場合は headingDivider: 2 だけを追加する", () => {
    expect(withMarpDirective("---\nmarp: true\n---\n# Title")).toBe("---\nheadingDivider: 2\nmarp: true\n---\n# Title");
  });

  it("headingDivider が指定済みなら、その値を優先して上書きしない", () => {
    expect(withMarpDirective("---\nheadingDivider: 3\n---\n# Title")).toBe(
      "---\nmarp: true\nheadingDivider: 3\n---\n# Title",
    );
  });

  it("marp: true と headingDivider が両方あればそのまま返す", () => {
    const md = "---\nmarp: true\nheadingDivider: 1\n---\n# Title";
    expect(withMarpDirective(md)).toBe(md);
  });

  it("CRLF の front matter も認識する", () => {
    expect(withMarpDirective("---\r\ntheme: gaia\r\n---\r\n# Title")).toBe(
      "---\nmarp: true\nheadingDivider: 2\ntheme: gaia\r\n---\r\n# Title",
    );
  });
});

describe("splitLongSections", () => {
  // --- 区切りでスライドごとの中身に分ける
  const slides = (md: string) => md.split(/^---$/m).map((s) => s.trim());

  it("上限に収まる節はそのまま返す", () => {
    const md = "## A\n\nshort";
    expect(splitLongSections(md, { maxLines: 10 })).toBe(md);
  });

  it("上限を超える節は、ブロックの境目で続きのスライドに分ける", () => {
    expect(slides(splitLongSections("p1\n\np2\n\np3", { maxLines: 4 }))).toEqual(["p1\n\np2", "p3"]);
  });

  it("h1/h2 の見出しで量の数え直しをする", () => {
    const md = "## A\n\np1\n\n## B\n\np2";
    expect(splitLongSections(md, { maxLines: 4 })).toBe(md);
  });

  it("既存の --- 区切りで量の数え直しをする", () => {
    const md = "p1\n\np2\n\n---\n\np3\n\np4";
    expect(splitLongSections(md, { maxLines: 4 })).toBe(md);
  });

  it("1 ブロックだけで上限を超えても空のスライドは作らない", () => {
    const md = `## A\n\n${Array.from({ length: 20 }, (_, i) => `- item${i}`).join("\n")}`;
    expect(splitLongSections(md, { maxLines: 4 })).toBe(md);
  });

  it("front matter は中身として数えず、先頭に残す", () => {
    const out = splitLongSections("---\ntheme: gaia\n---\np1\n\np2\n\np3", { maxLines: 4 });
    expect(out.startsWith("---\ntheme: gaia\n---\n")).toBe(true);
    expect(slides(out.replace(/^---\ntheme: gaia\n---\n/, ""))).toEqual(["p1\n\np2", "p3"]);
  });

  it("文字を大きくすると、1 枚に入る行数が減る", () => {
    const md = "p1\n\np2\n\np3";
    expect(splitLongSections(md, { maxLines: 6 })).toBe(md);
    expect(slides(splitLongSections(md, { maxLines: 6, scale: 2 }))).toEqual(["p1", "p2", "p3"]);
  });

  it("文字を大きくすると、1 行に入る文字数が減る", () => {
    const line = "あ".repeat(40);
    const md = `${line}\n\n${line}`;
    expect(splitLongSections(md, { maxLines: 8, scale: 2 })).not.toBe(md);
    expect(slides(splitLongSections(md, { maxLines: 8, scale: 2 }))).toEqual([line, line]);
  });

  it("本文の後に表が来たら、上限に収まっていても表の手前で次のスライドに分ける", () => {
    const table = "| a | b |\n| - | - |\n| 1 | 2 |";
    expect(slides(splitLongSections(`p1\n\n${table}`, { maxLines: 100 }))).toEqual(["p1", table]);
  });

  it("見出しの直後の表は見出しと同じスライドに残す", () => {
    const md = "## A\n\n| a | b |\n| - | - |\n| 1 | 2 |";
    expect(splitLongSections(md, { maxLines: 100 })).toBe(md);
  });
});

describe("stepSlide", () => {
  it("前後のスライドへ 1 枚ずつ移動する", () => {
    expect(stepSlide(1, 1, 3)).toBe(2);
    expect(stepSlide(1, -1, 3)).toBe(0);
  });

  it("最初のスライドより前、最後のスライドより後には移動しない", () => {
    expect(stepSlide(0, -1, 3)).toBe(0);
    expect(stepSlide(2, 1, 3)).toBe(2);
  });

  it("スライドがないときは 0 を返す", () => {
    expect(stepSlide(0, 1, 0)).toBe(0);
  });
});
