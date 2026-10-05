export function prStateBadge(state: string): { label: string; className: string } | null {
  if (state === "MERGED") {
    return { label: "Merged", className: "merged" };
  }
  if (state === "CLOSED") {
    return { label: "Closed", className: "closed" };
  }
  return null;
}
