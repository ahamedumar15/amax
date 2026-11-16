import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";

// 008 AC-2: the Git logins and emails a person commits as (auth.git_identity). A commit is attributed
// to its person only when the provider verified it or the email is verified for this identity.
export type GitProvider = "github" | "azure-devops";
export type GitIdentity = { id: string; userId: string; provider: GitProvider; login: string; email: string | null; emailVerified: boolean };

const identity = (r: Record<string, unknown>): GitIdentity => ({
  id: r.id as string, userId: r.user_id as string, provider: r.provider as GitProvider, login: r.login as string, email: (r.email as string | null) ?? null, emailVerified: Boolean(r.email_verified),
});

/** The identity a commit names: by login first, else by email. */
export async function findGitIdentity(tx: Tx, provider: GitProvider, who: { login: string | null; email: string | null }) {
  const [r] = await tx.execute(sql`select * from auth.git_identity where provider = ${provider}
    and (lower(login) = lower(${who.login ?? ""}) or (${who.email ?? ""} <> '' and lower(email) = lower(${who.email ?? ""})))
    order by (lower(login) = lower(${who.login ?? ""})) desc limit 1`);
  return r ? identity(r) : null;
}

/** An active person whose work email is this one: the candidate to link an unknown author to. */
export async function personByEmail(tx: Tx, email: string | null) {
  if (!email) return null;
  const [r] = await tx.execute(sql`select id, name from auth.user where lower(email) = lower(${email}) and status = 'active'`);
  return r ? { id: r.id as string, name: r.name as string } : null;
}

/** Links a login to a person, its email verified because a person approved the link. A login or email that is already
 * linked (108: one login may hold several emails, each email one person's) is refused. */
export async function linkGitIdentity(tx: Tx, tenantId: string, g: { provider: GitProvider; login: string; email: string | null; userId: string }) {
  const [taken] = await tx.execute(sql`select 1 from auth.git_identity where provider = ${g.provider}
    and (lower(login) = lower(${g.login}) or (${g.email ?? ""} <> '' and lower(email) = lower(${g.email ?? ""}))) limit 1`);
  const [r] = taken ? [] : await tx.execute(sql`insert into auth.git_identity (tenant_id, user_id, provider, login, email, email_verified)
    values (${tenantId}, ${g.userId}, ${g.provider}, ${g.login}, ${g.email}, ${g.email !== null}) on conflict do nothing returning *`);
  if (!r) throw Object.assign(new Error(`${g.provider} login ${g.login} is already linked`), { retryable: false, code: "invalid_input" });
  return identity(r);
}

export type GitHubLinkResult = { login: string; linked: string[]; removed: string[]; skipped: string[] };

/**
 * 108 AC-3–AC-5: a person's GitHub login and the emails GitHub verified, stored as their verified identities. A connect
 * again replaces the set: emails GitHub no longer lists go. A login or email linked to someone else is never taken over:
 * it is skipped and named, and the rest are linked (a login of someone else's skips every email).
 */
export async function setGitHubIdentities(tx: Tx, tenantId: string, userId: string, gh: { login: string; emails: string[] }): Promise<GitHubLinkResult> {
  const emails = [...new Set(gh.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const others = await tx.execute(sql`select lower(login) as login, lower(email) as email from auth.git_identity where provider = 'github' and user_id <> ${userId}
    and (lower(login) = lower(${gh.login}) or lower(email) = any(${`{${emails.map((e) => `"${e}"`).join(",")}}`}::text[]))`);
  const loginTaken = others.some((o) => o.login === gh.login.toLowerCase());
  const takenEmails = new Set(others.map((o) => o.email as string | null).filter((e): e is string => Boolean(e)));
  const kept = loginTaken ? [] : emails.filter((e) => !takenEmails.has(e));
  const removed = await tx.execute(sql`delete from auth.git_identity where provider = 'github' and user_id = ${userId}
    and not (lower(login) = lower(${gh.login}) and lower(coalesce(email, '')) = any(${`{${kept.map((e) => `"${e}"`).join(",")}}`}::text[])) returning email, login`);
  for (const e of kept) await tx.execute(sql`insert into auth.git_identity (tenant_id, user_id, provider, login, email, email_verified)
    values (${tenantId}, ${userId}, 'github', ${gh.login}, ${e}, true) on conflict do nothing`);
  return { login: gh.login, linked: kept, removed: removed.map((r) => String(r.email ?? r.login)), skipped: loginTaken ? [`@${gh.login}`] : emails.filter((e) => takenEmails.has(e)) };
}

/** A person's own Git identities, newest login first. */
export const gitIdentitiesOf = async (tx: Tx, userId: string) =>
  (await tx.execute(sql`select * from auth.git_identity where user_id = ${userId} order by provider, login, email`)).map(identity);

export const unlinkGitIdentity = (tx: Tx, id: string) => tx.execute(sql`delete from auth.git_identity where id = ${id}`);
