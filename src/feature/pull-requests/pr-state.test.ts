import { describe, it, expect } from "vitest";
import { prStateBadge } from "./pr-state";

describe("prStateBadge", () => {
  it("マージ済みなら Merged を表示する", () => {
    expect(prStateBadge("MERGED")).toEqual({ label: "Merged", className: "merged" });
  });

  it("マージされずに閉じたなら Closed を表示する", () => {
    expect(prStateBadge("CLOSED")).toEqual({ label: "Closed", className: "closed" });
  });

  it("Open の PR にはバッジを出さない", () => {
    expect(prStateBadge("OPEN")).toBeNull();
  });
});
