import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { setGitHubIdentities } from "@amax/auth/git-identity";
import { viewerOf } from "@amax/auth";
import { withdrawSuggestions } from "@amax/agents/server";
import { hasSecret } from "@amax/core/secrets";
import { contextFor, defineService, type ServiceContext } from "@amax/core/server";
import { EVENTS, NOT_SET_UP } from "../contracts";
import { CONNECT, selfOf } from "./context";
import { authorizeUrl, readGitHubUser } from "./github";

const hash = (state: string) => createHash("sha256").update(state).digest("hex");
const app = (ctx: ServiceContext) => contextFor.job(ctx.tenantId, "git-accounts.connect");
const refuse = (message: string) => Object.assign(new Error(message), { retryable: false, code: "invalid_input" });

/** 108 AC-1, AC-2: a single-use link to GitHub's authorize page for the viewer, good for 10 minutes. Only its hash is kept. */
export const issueConnect = defineService({
  name: "git-accounts.github.link", action: CONNECT, resource: "git_accounts.connect_state", input: z.object({}),
  async run(tx, _input, ctx) {
    const userId = selfOf(ctx);
    if (!(await hasSecret(tx, "github-oauth"))) throw refuse(NOT_SET_UP);
    const state = randomBytes(24).toString("base64url");
    await tx.execute(sql`insert into git_accounts.connect_state (tenant_id, user_id, state_hash) values (${ctx.tenantId}, ${userId}, ${hash(state)})`);
    const url = await authorizeUrl(app(ctx), state);
    return { result: { open: { label: "Continue to GitHub", url }, expiresInMinutes: 10 }, resourceId: userId, after: { issued: true } };
  },
});

/**
 * 108 AC-2, AC-3, AC-10: GitHub's return. The state must be one issued to this person, unused, under 10 minutes old;
 * then their login and verified emails are stored in this one audited write, no token kept, and open suggestions to link
 * that login are withdrawn: they connected it themselves.
 */
export const completeConnect = defineService({
  name: "git-accounts.github.connect", action: CONNECT, resource: "auth.git_identity", input: z.object({ state: z.string().min(16), code: z.string().min(1) }),
  async run(tx, input, ctx) {
    const userId = selfOf(ctx);
    const [used] = await tx.execute(sql`update git_accounts.connect_state set used_at = now() where state_hash = ${hash(input.state)} and user_id = ${userId}
      and used_at is null and created_at > now() - interval '10 minutes' returning id`);
    if (!used) throw refuse("That GitHub link has expired or was already used. Ask amax to connect GitHub again.");
    const gh = await readGitHubUser(app(ctx), input.code);
    const r = await setGitHubIdentities(tx, ctx.tenantId, userId, gh);
    if (r.linked.length) await withdrawSuggestions(app(ctx), { kind: "delivery.git-identity", targetType: "auth.git_identity", targetIds: [`github:${gh.login}`], reason: `${gh.login} connected GitHub themselves` });
    const n = r.linked.length;
    const summary = `${viewerOf(ctx)?.name ?? "Someone"} connected GitHub as @${gh.login}: ${n} email${n === 1 ? "" : "s"}`;
    return { result: { ...r, summary }, resourceId: userId, after: { summary, ...r },
      events: [{ name: EVENTS.connected, payload: { userId, login: gh.login, emails: n } }] };
  },
});
