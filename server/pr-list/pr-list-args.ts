const PR_FIELDS = "number,title,author,reviewRequests,url,state,isDraft,createdAt,updatedAt";

export function prListArgs({ repo, reviewer }: { repo?: string; reviewer?: string }): string[] {
  const args = ["pr", "list", "--state", "open", "--json", PR_FIELDS, "--limit", "100"];

  if (repo) {
    args.push("--repo", repo);
  }

  if (reviewer) {
    args.push("--search", `review-involves:${reviewer}`);
  }

  return args;
}
