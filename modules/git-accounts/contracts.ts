// 108: the git-accounts module's import surface. The app's GitHub callback route finishes a connect through
// `completeGitHubConnect`; nothing else reaches into the module.
export { completeConnect as completeGitHubConnect } from "./server/connect";

export const EVENTS = { connected: "git-accounts.github.connected", disconnected: "git-accounts.github.disconnected" } as const;
export type GitHubConnected = { userId: string; login: string; emails: number };

export type GitAccounts = { configured: boolean; github: { login: string; emails: { id: string; email: string; verified: boolean }[] } | null };

/** Said by the screen, chat and Settings when the tenant has no GitHub app credential (AC-1). */
export const NOT_SET_UP = "GitHub isn't set up for this workspace; an Admin adds the GitHub app";
