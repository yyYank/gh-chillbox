import { describe, it, expect } from "vitest";
import { stepFontSize, parseFontSize, DEFAULT_FONT_SIZE } from "./diff-font-size";

describe("stepFontSize", () => {
  it("1px ずつ増減する", () => {
    expect(stepFontSize(12, 1)).toBe(13);
    expect(stepFontSize(12, -1)).toBe(11);
  });

  it("9px 未満にはならない", () => {
    expect(stepFontSize(9, -1)).toBe(9);
  });

  it("20px を超えない", () => {
    expect(stepFontSize(20, 1)).toBe(20);
  });
});

describe("parseFontSize", () => {
  it("保存値を数値として読み取る", () => {
    expect(parseFontSize("15")).toBe(15);
  });

  it("保存値がない・壊れている・範囲外のときは既定値に戻す", () => {
    expect(parseFontSize(null)).toBe(DEFAULT_FONT_SIZE);
    expect(parseFontSize("abc")).toBe(DEFAULT_FONT_SIZE);
    expect(parseFontSize("100")).toBe(DEFAULT_FONT_SIZE);
  });
});
