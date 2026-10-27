import { describe, it, expect } from "vitest";
import { parsePrState } from "./pr-state";

describe("parsePrState", () => {
  it("gh の state を小文字の状態に変換する", () => {
    expect(parsePrState("MERGED\n")).toBe("merged");
    expect(parsePrState("CLOSED")).toBe("closed");
    expect(parsePrState("OPEN")).toBe("open");
  });

  it("知らない値は open とみなす", () => {
    expect(parsePrState("")).toBe("open");
  });
});
