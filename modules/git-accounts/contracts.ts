// 108: the git-accounts module's import surface. The app's GitHub callback route finishes a connect through
// `completeGitHubConnect`; nothing else reaches into the module.
export { completeConnect as completeGitHubConnect } from "./server/connect";
export { GitHubReplyError } from "./server/github";

export const EVENTS = { connected: "git-accounts.github.connected", disconnected: "git-accounts.github.disconnected" } as const;
export type GitHubConnected = { userId: string; login: string; emails: number };

export type GitHubLogin = { login: string; identityIds: string[]; emails: { id: string; email: string; verified: boolean }[] };
export type GitAccounts = { configured: boolean; github: { logins: GitHubLogin[] } | null };

/** Said by the screen, chat and Settings when the tenant has no GitHub app credential (AC-1). */
export const NOT_SET_UP = "GitHub isn't set up for this workspace; an Admin adds the GitHub app";

/** Review round 1 (AC-7): owners follow the repo, so a proposal named for these emails is unowned again at the next sync. */
export const OWNERS_NOTE = "proposals named for you through these emails lose you as owner at the next sync, unless their Owner line or your account email names you";
