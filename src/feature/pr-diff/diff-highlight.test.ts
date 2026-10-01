import { describe, it, expect } from "vitest";
import { languageFromPath, highlightLine } from "./diff-highlight";

describe("languageFromPath", () => {
  it("拡張子から highlight.js の言語名を判定する", () => {
    expect(languageFromPath("src/App.tsx")).toBe("typescript");
    expect(languageFromPath("server/main.go")).toBe("go");
    expect(languageFromPath(".github/workflows/ci.yml")).toBe("yaml");
    expect(languageFromPath("scripts/verify.sh")).toBe("bash");
  });

  it("対応していない拡張子や拡張子なしは null を返す", () => {
    expect(languageFromPath("notes.txt")).toBeNull();
    expect(languageFromPath("Makefile")).toBeNull();
  });
});

describe("highlightLine", () => {
  it("キーワードを hljs のクラス付き span で囲む", () => {
    expect(highlightLine("const a = 1;", "typescript")).toContain('<span class="hljs-keyword">const</span>');
  });

  it("ハイライト時も HTML の特殊文字をエスケープする", () => {
    expect(highlightLine("if (a < b) {}", "typescript")).toContain("&lt;");
  });

  it("言語が null のときはエスケープしたテキストだけを返す", () => {
    expect(highlightLine("<div>&</div>", null)).toBe("&lt;div&gt;&amp;&lt;/div&gt;");
  });
});
