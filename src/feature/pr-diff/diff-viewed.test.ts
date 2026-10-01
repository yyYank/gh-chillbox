import { describe, it, expect } from "vitest";
import { countViewed } from "./diff-viewed";

describe("countViewed", () => {
  it("VIEWED のファイルだけを viewed として数える", () => {
    const paths = ["a.ts", "b.ts", "c.ts"];
    const states = { "a.ts": "VIEWED", "b.ts": "UNVIEWED", "c.ts": "VIEWED" } as const;
    expect(countViewed(paths, states)).toEqual({ viewed: 2, total: 3 });
  });

  it("前回 viewed 後に変更された DISMISSED は viewed に数えない", () => {
    expect(countViewed(["a.ts"], { "a.ts": "DISMISSED" })).toEqual({ viewed: 0, total: 1 });
  });

  it("状態が取得できていないファイルは viewed に数えない", () => {
    expect(countViewed(["a.ts", "b.ts"], { "a.ts": "VIEWED" })).toEqual({ viewed: 1, total: 2 });
  });
});
