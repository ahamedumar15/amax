import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { setGitHubIdentities } from "@amax/auth/git-identity";
import { viewerOf } from "@amax/auth";
import { withdrawSuggestions } from "@amax/agents/server";
import { contextFor, defineService, logError, type ServiceContext } from "@amax/core/server";
import { EVENTS } from "../contracts";
import { CONNECT, selfOf } from "./context";
import { authorizeUrl, readGitHubUser } from "./github";

const hash = (state: string) => createHash("sha256").update(state).digest("hex");
/** GitHub's app is used by the system, acting for the person who connects (rule 4). */
export const forPerson = (ctx: ServiceContext) => contextFor.job(ctx.tenantId, "git-accounts.connect", `user:${selfOf(ctx)}`);

/** Why a connect didn't happen, as a code the Git accounts screen turns into fixed words (final pass: nothing else). */
export type ConnectReason = "expired" | "no-email" | "all-taken" | "login-taken";
export const refuse = (message: string, reason?: ConnectReason) => Object.assign(new Error(message), { retryable: false, code: "invalid_input", reason });

/**
 * 108 AC-1, AC-2: a single-use link to GitHub's authorize page for the viewer, good for 10 minutes. Only its hash is kept.
 * Final pass: the app's client id is read before this write, so the write holds one connection and only stores the state.
 */
export const issueConnect = defineService({
  name: "git-accounts.github.link", action: CONNECT, resource: "git_accounts.connect_state", input: z.object({ clientId: z.string().min(1) }),
  async run(tx, input, ctx) {
    const userId = selfOf(ctx);
    await tx.execute(sql`delete from git_accounts.connect_state where user_id = ${userId} and (used_at is not null or created_at < now() - interval '10 minutes')`);
    const state = randomBytes(24).toString("base64url");
    await tx.execute(sql`insert into git_accounts.connect_state (tenant_id, user_id, state_hash) values (${ctx.tenantId}, ${userId}, ${hash(state)})`);
    return { result: { open: { label: "Continue to GitHub", url: authorizeUrl(input.clientId, state) }, expiresInMinutes: 10 }, resourceId: userId, after: { issued: true } };
  },
});

/** 108 AC-2: GitHub's return claims the state, once: issued to this person, unused, under 10 minutes old. */
const claimConnect = defineService({
  name: "git-accounts.github.claim", action: CONNECT, resource: "git_accounts.connect_state", input: z.object({ state: z.string().min(16) }),
  async run(tx, input, ctx) {
    const [claim] = await tx.execute(sql`update git_accounts.connect_state set used_at = now() where state_hash = ${hash(input.state)} and user_id = ${selfOf(ctx)}
      and used_at is null and created_at > now() - interval '10 minutes' returning id`);
    if (!claim) throw refuse("That GitHub link has expired or was already used. Ask amax to connect GitHub again.", "expired");
    return { result: { claimId: claim.id as string }, resourceId: claim.id as string, after: { claimed: true } };
  },
});

/**
 * 108 AC-3: what GitHub said, stored once against the claim, in one audited write. Final pass: a connect that would link
 * nothing (no verified email, every email or the login someone else's) is refused and leaves what was there.
 */
const storeConnect = defineService({
  name: "git-accounts.github.connect", action: CONNECT, resource: "auth.git_identity",
  input: z.object({ claimId: z.uuid(), login: z.string().min(1), emails: z.array(z.string()) }),
  async run(tx, input, ctx) {
    const userId = selfOf(ctx);
    const [ok] = await tx.execute(sql`update git_accounts.connect_state set stored_at = now() where id = ${input.claimId} and user_id = ${userId}
      and used_at > now() - interval '10 minutes' and stored_at is null returning id`);
    if (!ok) throw refuse("That GitHub link has expired or was already used. Ask amax to connect GitHub again.", "expired");
    if (!input.emails.length) throw refuse("GitHub has no verified email for you: verify one on GitHub, then connect again.", "no-email");
    const r = await setGitHubIdentities(tx, ctx.tenantId, userId, input);
    if (r.skipped.includes(`@${input.login}`)) throw refuse(`@${input.login} is linked to another person; ask an Admin.`, "login-taken");
    if (!r.linked.length) throw refuse("Every verified email on your GitHub is linked to another person; ask an Admin.", "all-taken");
    const n = r.linked.length;
    const summary = `${viewerOf(ctx)?.name ?? "Someone"} connected GitHub as @${input.login}: ${n} email${n === 1 ? "" : "s"}`;
    return { result: { ...r, summary }, resourceId: userId, after: { summary, ...r },
      events: [{ name: EVENTS.connected, payload: { userId, login: input.login, emails: n } }] };
  },
});

/**
 * 108 AC-2, AC-3, AC-10: GitHub's return, end to end. Each write is short and no call to GitHub runs inside one (review
 * round 1): claim the state, read GitHub, store; then open suggestions to link that login are withdrawn, for the person.
 */
export async function completeConnect(ctx: ServiceContext, input: { state: string; code: string }) {
  const { claimId } = await claimConnect(ctx, { state: input.state });
  const gh = await readGitHubUser(forPerson(ctx), input.code);
  const r = await storeConnect(ctx, { claimId, login: gh.login, emails: gh.emails });
  // Review round 2: the identities are stored; a suggestion left open is logged, never reported as a failed connect.
  await withdrawSuggestions(forPerson(ctx), { kind: "delivery.git-identity", targetType: "auth.git_identity", targetIds: [`github:${gh.login}`], reason: `${gh.login} connected GitHub themselves` })
    .catch((e: unknown) => logError("git-accounts.withdraw", e));
  return r;
}
