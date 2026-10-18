// 062: one rule for naming a repo, shared by amax (the link and the push check) and the amax plugin,
// which bundles this file (kept free of dependencies) and sends only the normalised name.

/** "https://user@GitHub.com/Example/Portal.git" and "git@github.com:example/portal" are both "github.com/example/portal". */
export const normaliseRepo = (url: string) =>
  url.trim().toLowerCase().replace(/^[a-z+]+:\/\//, "").replace(/^[^@/]+@/, "").replace(/^([^/:]+):(?!\d+\/)/, "$1/").replace(/^([^/:]+):\d+\//, "$1/").replace(/\.git$/, "").replace(/\/+$/, "");

/** A user name with a secret before the host, in any form: scheme://user:token@host or user:token@host:path. */
export const hasCredentials = (url: string) => /^([a-z+]+:\/\/)?[^/@\s]+:[^/@\s]*@/i.test(url.trim()) || /^[a-z+]+:\/\/[^/@\s]+@/i.test(url.trim());
