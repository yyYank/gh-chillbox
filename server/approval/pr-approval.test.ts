import { describe, it, expect } from "vitest";
import { isApproved } from "./pr-approval";

const review = (login: string, state: string) => ({ author: { login }, state });

describe("isApproved", () => {
  it("必要な承認がそろっていれば approve 済み", () => {
    expect(isApproved({ reviewDecision: "APPROVED", latestReviews: [] }, "me")).toBe(true);
  });

  it("承認がそろっていなくても自分の最新レビューが approve なら approve 済み", () => {
    expect(isApproved({ reviewDecision: "REVIEW_REQUIRED", latestReviews: [review("me", "APPROVED")] }, "me")).toBe(
      true,
    );
  });

  it("ほかの人だけが approve していて承認がそろっていなければ approve 済みではない", () => {
    expect(isApproved({ reviewDecision: "REVIEW_REQUIRED", latestReviews: [review("other", "APPROVED")] }, "me")).toBe(
      false,
    );
  });

  it("自分の最新レビューが approve 以外なら approve 済みではない", () => {
    expect(
      isApproved({ reviewDecision: "CHANGES_REQUESTED", latestReviews: [review("me", "CHANGES_REQUESTED")] }, "me"),
    ).toBe(false);
  });

  it("reviewDecision が空でもレビューが無ければ approve 済みではない", () => {
    expect(isApproved({ reviewDecision: "", latestReviews: [] }, "me")).toBe(false);
  });
});
