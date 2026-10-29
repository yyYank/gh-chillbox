import { describe, it, expect } from "vitest";
import { countViewed, resolveCollapsed } from "./diff-viewed";

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

describe("resolveCollapsed", () => {
  it("開け閉めの記録がなければ、VIEWED のファイルだけを閉じる", () => {
    const states = { "a.ts": "VIEWED", "b.ts": "UNVIEWED", "c.ts": "DISMISSED" } as const;
    expect(resolveCollapsed({}, states)).toEqual(new Set(["a.ts"]));
  });

  it("記録したときから viewed が変わっていなければ、自分の開け閉めを使う", () => {
    const records = {
      "a.ts": { collapsed: false, viewed: true },
      "b.ts": { collapsed: true, viewed: false },
    };
    const states = { "a.ts": "VIEWED", "b.ts": "UNVIEWED" } as const;
    expect(resolveCollapsed(records, states)).toEqual(new Set(["b.ts"]));
  });

  it("記録したあとに GitHub で viewed が変わっていれば、GitHub に合わせる", () => {
    const records = {
      "a.ts": { collapsed: false, viewed: false },
      "b.ts": { collapsed: true, viewed: true },
    };
    const states = { "a.ts": "VIEWED", "b.ts": "DISMISSED" } as const;
    expect(resolveCollapsed(records, states)).toEqual(new Set(["a.ts"]));
  });

  it("viewed の状態が取れていないときは、自分の開け閉めの記録を使う", () => {
    const records = {
      "a.ts": { collapsed: true, viewed: false },
      "b.ts": { collapsed: false, viewed: true },
    };
    expect(resolveCollapsed(records, null)).toEqual(new Set(["a.ts"]));
  });
});
