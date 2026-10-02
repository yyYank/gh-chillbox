import { describe, it, expect } from "vitest";
import { parseViewedPage, type ViewedState } from "./pr-viewed";

function page(
  nodes: { path: string; viewerViewedState: ViewedState }[],
  hasNextPage = false,
  endCursor: string | null = null,
) {
  return {
    data: {
      repository: {
        pullRequest: {
          id: "PR_kwDOabc",
          files: { nodes, pageInfo: { hasNextPage, endCursor } },
        },
      },
    },
  };
}

describe("parseViewedPage", () => {
  it("PR の Node ID とファイルごとの viewed 状態を読み取る", () => {
    const result = parseViewedPage(
      page([
        { path: "src/a.ts", viewerViewedState: "VIEWED" },
        { path: "src/b.ts", viewerViewedState: "UNVIEWED" },
        { path: "src/c.ts", viewerViewedState: "DISMISSED" },
      ]),
    );
    expect(result.pullRequestId).toBe("PR_kwDOabc");
    expect(result.states).toEqual({
      "src/a.ts": "VIEWED",
      "src/b.ts": "UNVIEWED",
      "src/c.ts": "DISMISSED",
    });
  });

  it("次ページがあるときはカーソルを返す", () => {
    const result = parseViewedPage(page([], true, "Y3Vyc29y"));
    expect(result.nextCursor).toBe("Y3Vyc29y");
  });

  it("次ページがないときはカーソルを返さない", () => {
    const result = parseViewedPage(page([], false, "Y3Vyc29y"));
    expect(result.nextCursor).toBeNull();
  });

  it("PR が見つからないときはエラーにする", () => {
    expect(() => parseViewedPage({ data: { repository: { pullRequest: null } } })).toThrow();
  });
});
