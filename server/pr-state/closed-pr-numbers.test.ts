import { describe, it, expect } from "vitest";
import { closedPrNumbers } from "./pr-state";

describe("closedPrNumbers", () => {
  it("close 済みと merge 済みの PR 番号だけを返す", async () => {
    const states: Record<number, string> = { 1: "OPEN", 2: "CLOSED", 3: "MERGED" };
    const view = async (n: number) => states[n];
    expect(await closedPrNumbers([1, 2, 3], view)).toEqual([2, 3]);
  });

  it("状態を取れなかった PR は閉じない（open とみなす）", async () => {
    const view = async (n: number) => {
      if (n === 2) {
        throw new Error("not found");
      }
      return "CLOSED";
    };
    expect(await closedPrNumbers([1, 2], view)).toEqual([1]);
  });
});
