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

/** Links a login to a person, its email verified because a person approved the link. */
export async function linkGitIdentity(tx: Tx, tenantId: string, g: { provider: GitProvider; login: string; email: string | null; userId: string }) {
  const [r] = await tx.execute(sql`insert into auth.git_identity (tenant_id, user_id, provider, login, email, email_verified) values (${tenantId}, ${g.userId}, ${g.provider}, ${g.login}, ${g.email}, ${g.email !== null})
    on conflict (tenant_id, provider, login) do nothing returning *`);
  if (!r) throw Object.assign(new Error(`${g.provider} login ${g.login} is already linked`), { retryable: false, code: "invalid_input" });
  return identity(r);
}

export const unlinkGitIdentity = (tx: Tx, id: string) => tx.execute(sql`delete from auth.git_identity where id = ${id}`);
