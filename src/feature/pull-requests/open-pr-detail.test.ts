import { describe, expect, it, vi } from "vitest";
import { openPrDetailInNewTab } from "./open-pr-detail";

describe("openPrDetailInNewTab", () => {
  it("PR詳細のURLを別タブ(_blank)で開く", () => {
    const open = vi.fn();
    openPrDetailInNewTab(42, open);
    expect(open).toHaveBeenCalledWith("/pr-detail?id=42", "_blank");
  });
});
