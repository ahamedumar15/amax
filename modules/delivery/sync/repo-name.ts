// 062: one rule for naming a repo, shared by amax (the link and the push check) and the amax plugin,
// which bundles this file (kept free of dependencies) and sends only the normalised name.

/** "https://user@GitHub.com/Example/Portal.git" and "git@github.com:example/portal" are both "github.com/example/portal". */
export const normaliseRepo = (url: string) =>
  url.trim().toLowerCase().replace(/^[a-z+]+:\/\//, "").replace(/^[^@/]+@/, "").replace(/^([^/:]+):(?!\d+\/)/, "$1/").replace(/^([^/:]+):\d+\//, "$1/").replace(/\.git$/, "").replace(/\/+$/, "");

/** A secret before the host: user:token@ in any form, or any user in an http(s) URL, git+https too (where it is a token).
 * An SSH user alone (ssh://git@host/…, git@host:…) names no secret. */
export const hasCredentials = (url: string) => /^([a-z+]+:\/\/)?[^/@\s:]+:[^/@\s]*@/i.test(url.trim()) || /^([a-z]+\+)?https?:\/\/[^/@\s]+@/i.test(url.trim());
