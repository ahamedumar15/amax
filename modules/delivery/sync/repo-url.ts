// 062: one rule for naming a repo, shared by amax (the link and the push check) and the amax plugin,
// which bundles this file and sends only the normalised name, so no remote credential leaves the machine.
import { z } from "zod";

/** "https://user@GitHub.com/Example/Portal.git" and "git@github.com:example/portal" are both "github.com/example/portal". */
export const normaliseRepo = (url: string) =>
  url.trim().toLowerCase().replace(/^[a-z+]+:\/\//, "").replace(/^[^@/]+@/, "").replace(/^([^/:]+):(?!\d+\/)/, "$1/").replace(/^([^/:]+):\d+\//, "$1/").replace(/\.git$/, "").replace(/\/+$/, "");

// A URL with a user or token in it (https://x-access-token:ghp_…@github.com/…) is refused rather than
// stored or echoed back in an error. The scp form (git@host:path) names an SSH user, not a secret.
export const RepoUrl = z.string().min(3).max(300)
  .refine((u) => !/^[a-z+]+:\/\/[^/@]+@/i.test(u.trim()), "remove the user name or token from the repo URL")
  .refine((u) => /^[a-z0-9.-]+\/\S+$/.test(normaliseRepo(u)), "not a repo URL");
