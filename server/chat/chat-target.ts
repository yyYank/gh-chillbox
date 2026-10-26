// repo と prNumber は gh の引数や clone URL に入るので、- 始まりやパス区切りを含む値を通さない
const REPO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isValidChatTarget(repo: unknown, prNumber: unknown): boolean {
  return typeof repo === "string" && REPO_PATTERN.test(repo) && Number.isInteger(prNumber) && (prNumber as number) > 0;
}
