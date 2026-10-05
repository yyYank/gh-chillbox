const PR_FIELDS = "number,title,author,reviewRequests,url,state,isDraft,createdAt,updatedAt";

export function prListArgs({ repo, reviewer, state }: { repo?: string; reviewer?: string; state?: string }): string[] {
  // gh の closed はマージ済みも含む
  const ghState = state === "closed" ? "closed" : "open";
  const args = ["pr", "list", "--state", ghState, "--json", PR_FIELDS, "--limit", "100"];

  if (repo) {
    args.push("--repo", repo);
  }

  if (reviewer) {
    args.push("--search", `review-involves:${reviewer}`);
  }

  return args;
}
