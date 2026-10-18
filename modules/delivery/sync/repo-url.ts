// 062: the repo URL a tool accepts. A URL with a user or token in it (https://x-access-token:ghp_…@…,
// or x-access-token:ghp_…@github.com:org/repo) is refused rather than stored or echoed in an error;
// the scp form git@host:path names an SSH user, not a secret, and is accepted.
import { z } from "zod";
import { hasCredentials, normaliseRepo } from "./repo-name";

export { normaliseRepo };

export const RepoUrl = z.string().min(3).max(300)
  .refine((u) => !hasCredentials(u), "remove the user name or token from the repo URL")
  .refine((u) => /^[a-z0-9.-]+\/\S+$/.test(normaliseRepo(u)), "not a repo URL");
