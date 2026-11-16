import type { OverviewPart } from "@amax/core";
import { can, type Viewer } from "@amax/auth";
import { CONNECT } from "./server/context";
import { myGitAccounts } from "./server/read";

/**
 * 116 AC-5: Overview's "Waiting on you" asks a person to connect GitHub while it would credit them: they can connect,
 * the workspace has the GitHub app, and they hold no GitHub login yet. "Not now" hides it for 30 days in that browser.
 */
export async function gitAccountsOverview(v: Viewer): Promise<OverviewPart> {
  if (!can(v, CONNECT)) return {};
  const { configured, github } = await myGitAccounts(v);
  if (!configured || github) return {};
  return { waiting: [{
    id: "git-accounts.connect-github", title: "Connect GitHub", detail: "so your commits and proposals are credited to you", context: "Git accounts",
    raisedBy: "amax", agent: true, since: new Date().toISOString(), action: "Ask amax · Connect GitHub", prompt: "Connect my GitHub",
    pin: { label: "Your Git accounts", tool: "get_my_git_identities", args: {} }, snoozeDays: 30,
  }] };
}
