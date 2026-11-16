import { z } from "zod";
import type { McpToolDef, ToolCard } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { NOT_SET_UP } from "./contracts";
import { identityOf } from "./pins";
import { issueConnect } from "./server/connect";
import { CONNECT, ctxFor, READ, UNLINK } from "./server/context";
import { myGitAccounts, myIdentity } from "./server/read";
import { disconnectGitHub, unlinkIdentity } from "./server/services";

type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: READ };

/** 108 AC-1: the Connect GitHub card; once confirmed, its button opens GitHub. Without the app, chat says who sets it up. */
const connectCard = async (v: Viewer): Promise<ToolCard> => {
  const { configured, github } = await myGitAccounts(v);
  if (!configured) throw new Error(NOT_SET_UP);
  return { title: "Connect GitHub", lines: [{ label: "Reads", value: "your GitHub login and the emails GitHub verified, once" }, { label: "Kept", value: "no GitHub token" },
    ...(github ? [{ label: "Now", value: `@${github.login}: connecting again replaces its emails` }] : [])],
    look: { kind: "Git accounts", confirm: "Connect GitHub", done: "Continue on GitHub to finish" } };
};

/** 108 AC-7: the red card names what goes. */
const disconnectCard = async (v: Viewer): Promise<ToolCard> => {
  const g = (await myGitAccounts(v)).github;
  if (!g) throw new Error("GitHub isn't connected");
  const what = `@${g.login} and ${g.emails.length} email${g.emails.length === 1 ? "" : "s"}`;
  return { title: `Disconnect GitHub: ${what}`, lines: [{ label: "Removes", value: what }, { label: "Kept", value: "proposals you already own keep you as owner" }],
    look: { kind: "Git accounts", confirm: "Disconnect", tone: "danger", done: `Disconnected ${what}` } };
};

export const mcpTools: McpToolDef[] = [
  tool({ ...read, pin: "view", name: "get_my_git_identities", description: "Your Git accounts: whether GitHub is set up in this workspace, your GitHub login and the verified emails amax matches your commits by.",
    input: z.object({}), run: (v) => myGitAccounts(v) }),
  tool({ ...read, pin: { id: "identityId", of: identityOf }, name: "get_my_git_identity", description: "One of your verified Git emails by id.",
    input: z.object({ identityId: z.uuid() }), run: (v, a) => myIdentity(v, a.identityId) }),
  tool({ scope: "write", permission: CONNECT, name: "connect_github", description: "Connect your GitHub account: gives you a single-use link to GitHub (10 minutes) where you approve amax reading your login and verified emails once.",
    input: z.object({}), card: connectCard, service: issueConnect, run: (v, _a, s = "mcp") => issueConnect(ctxFor(v, s), {}) }),
  tool({ scope: "write", permission: CONNECT, destructive: true, name: "disconnect_github", description: "Disconnect your GitHub account: removes your GitHub login and its emails from amax. Proposals you own keep you as owner.",
    input: z.object({}), card: disconnectCard, service: disconnectGitHub, run: (v, _a, s = "mcp") => disconnectGitHub(ctxFor(v, s), {}) }),
  tool({ scope: "write", permission: UNLINK, destructive: true, name: "unlink_git_identity", description: "Admin: unlink one Git identity (a login's email) of any person by its id.",
    input: z.object({ identityId: z.uuid() }), service: unlinkIdentity, run: (v, a, s = "mcp") => unlinkIdentity(ctxFor(v, s), a) }),
];

