import type { ChatSuggestion } from "@amax/core";
import { can, type Viewer } from "@amax/auth";
import { MANAGE_APP } from "./app-tool";
import { myGitAccounts } from "./server/read";

// 108: what chat offers on Git accounts, each only when it can happen: connect when GitHub is set up and not connected,
// disconnect when it is. A suggestion fills the message box; chat still confirms.
const state = async (v: Viewer) => myGitAccounts(v);
const when = (check: (v: Viewer) => Promise<boolean>) => check as ChatSuggestion["when"];
// 116 AC-3: on Integrations, only for those who manage credentials, each only when it can happen.
const admin = (set: boolean) => when(async (v) => can(v, MANAGE_APP) && (await state(v)).configured === set);
const INTEGRATIONS = ["/settings/integrations"];

export const chatSuggestions: ChatSuggestion[] = [
  { routes: ["/git-accounts"], label: "Connect GitHub", prompt: "Connect my GitHub", tool: "connect_github", when: when(async (v) => { const s = await state(v); return s.configured && !s.github; }) },
  { routes: INTEGRATIONS, label: "Set up the GitHub app", prompt: "Set up the GitHub app", tool: "set_github_app", when: admin(false) },
  { routes: INTEGRATIONS, label: "Rotate the GitHub app secret", prompt: "Rotate the GitHub app secret", tool: "set_github_app", when: admin(true) },
  { routes: INTEGRATIONS, label: "Remove the GitHub app", prompt: "Remove the GitHub app: revoke the github-oauth credential as unused", tool: "revoke_secret", when: admin(true) },
  { routes: ["/git-accounts"], label: "Disconnect GitHub", prompt: "Disconnect my GitHub", tool: "disconnect_github", when: when(async (v) => Boolean((await state(v)).github)) },
];
