// 091 AC-3: one rule for a commit sha, for every specclaw writer. A ref is "<branch>@<sha>", and withdrawal compares
// refs with the sha taken off (`refOf`), so a sha this rule doesn't accept would leave its ref unmatched for good.
export const SHA = "[0-9a-f]{7,40}";
export const SHA_RE = new RegExp(`^${SHA}$`, "i");
export const isSha = (sha: string) => SHA_RE.test(sha);

/** Throws when `sha` isn't a commit sha, naming where it came from. */
export function assertSha(sha: string, where: string) {
  if (!isSha(sha)) throw new Error(`${where} must be a commit sha (7 to 40 hex characters), got "${sha}"`);
}
