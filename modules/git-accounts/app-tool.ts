import { z } from "zod";
import type { McpToolDef, ToolCard } from "@amax/core";
import { putSecret } from "@amax/core/secrets";
import type { Viewer } from "@amax/auth";
import { checkClientId, checkClientSecret, hasGitHubApp, storeGitHubApp } from "./server/app";
import { ctxFor } from "./server/context";
import { redirectUri } from "./server/github";

export const MANAGE_APP = "secrets:credential:manage";
const Input = z.object({ clientId: z.string().trim().describe("The GitHub OAuth app's Client ID, as GitHub shows it on the app's page") });

/** 116 AC-1: the card says what GitHub needs back (the callback URL, to copy) and whether this adds or replaces the app. */
const appCard = async (v: Viewer, a: z.infer<typeof Input>): Promise<ToolCard> => {
  const replaces = await hasGitHubApp(ctxFor(v, "chat"));
  return {
    title: replaces ? "Replace the GitHub app" : "Set up the GitHub app",
    lines: [{ label: "Client ID", value: a.clientId }, { label: "Callback URL to paste into GitHub", value: redirectUri(), copy: true },
      { label: replaces ? "Replaces" : "Adds", value: replaces ? "the GitHub app's client id and secret; the old secret works 72 more hours" : "the GitHub app people connect their GitHub accounts through" }],
    look: { kind: "Integrations", confirm: replaces ? "Replace the GitHub app" : "Set up the GitHub app", done: replaces ? "GitHub app replaced" : "GitHub app set up" },
  };
};

/** 116 AC-1: an Admin sets up or replaces the GitHub app; the Client secret is typed only into the card's masked field. */
export const setGitHubAppTool = {
  scope: "write", permission: MANAGE_APP, name: "set_github_app", secretInput: { label: "Client secret" },
  description: "Admin: set up or replace the GitHub app people connect their GitHub accounts through (connector github-oauth). Give clientId, the app's Client ID from GitHub; ask for it if the person hasn't said it. The person types the Client secret on the confirm card. Use this, never put_secret or rotate_secret, for the GitHub app.",
  input: Input, card: appCard, service: putSecret,
  propose: async (_v: Viewer, a: z.infer<typeof Input>) => checkClientId(a.clientId),
  run: async (v: Viewer, a: z.infer<typeof Input>, s: "mcp" | "chat" | "api" = "mcp", secret?: string) => {
    checkClientId(a.clientId);
    return storeGitHubApp(ctxFor(v, s), a.clientId, checkClientSecret(secret));
  },
} as unknown as McpToolDef;
