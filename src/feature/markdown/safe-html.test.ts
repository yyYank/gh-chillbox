// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderMarkdown, sanitizeHtml } from "./safe-html";

describe("sanitizeHtml", () => {
  it("script タグを取り除く", () => {
    expect(sanitizeHtml("<p>hi</p><script>alert(1)</script>")).toBe("<p>hi</p>");
  });

  it("onerror などのイベント属性を取り除く", () => {
    expect(sanitizeHtml('<img src="x" onerror="alert(1)">')).toBe('<img src="x">');
  });

  it("javascript: のリンク先を取り除く", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
  });

  it("mermaid の図のブロックはそのまま残す", () => {
    expect(sanitizeHtml('<pre class="mermaid">graph TD; A--&gt;B</pre>')).toBe(
      '<pre class="mermaid">graph TD; A--&gt;B</pre>',
    );
  });
});

describe("renderMarkdown", () => {
  it("markdown の中に書かれた生の HTML も消毒してから返す", () => {
    expect(renderMarkdown('**太字** <img src="x" onerror="alert(1)">')).toBe(
      '<p><strong>太字</strong> <img src="x"></p>\n',
    );
  });
});
