export type ApprovalView = {
  reviewDecision: string;
  latestReviews: { author: { login: string }; state: string }[];
};

// 必要な承認がそろった PR と、自分が approve した PR のどちらも approve 済みとみなす
export function isApproved(view: ApprovalView, me: string): boolean {
  return (
    view.reviewDecision === "APPROVED" ||
    view.latestReviews.some((r) => r.author.login === me && r.state === "APPROVED")
  );
}
