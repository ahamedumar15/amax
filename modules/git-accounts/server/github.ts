import { z } from "zod";
import { loadEnv } from "@amax/core/env";
import { useSecret } from "@amax/core/secrets";
import type { ServiceContext } from "@amax/core/server";

// 108: GitHub's OAuth app, the one place amax talks to GitHub for a person's accounts. Its client id and secret are one
// 031 credential (`github-oauth`, "<client id>:<client secret>"), never env; the URLs may point at a fake GitHub in tests.
export const SCOPES = "read:user user:email";
const TIMEOUT_MS = 10_000;
const web = () => (loadEnv().AMAX_GITHUB_URL ?? "https://github.com").replace(/\/$/, "");
const api = () => (loadEnv().AMAX_GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "");

/** Review round 1: GitHub returns to amax's public URL; without AMAX_BASE_URL in production, connect refuses (fail closed). */
export function redirectUri() {
  const env = loadEnv();
  if (!env.AMAX_BASE_URL && env.NODE_ENV === "production") throw Object.assign(new Error("amax's public URL (AMAX_BASE_URL) isn't set, so GitHub can't return here; an Admin sets it"), { retryable: false, code: "invalid_input" });
  return `${(env.AMAX_BASE_URL ?? `http://localhost:${env.PORT ?? 3000}`).replace(/\/$/, "")}/api/git/github/callback`;
}

const app = (ctx: ServiceContext, purpose: string) => <T>(fn: (id: string, secret: string) => Promise<T>) =>
  useSecret(ctx, { connector: "github-oauth", purpose }, (s) => {
    const [id, secret] = s.reveal().split(":");
    if (!id || !secret) throw new Error("the GitHub app credential isn't <client id>:<client secret>; an Admin sets it again");
    return fn(id, secret);
  });

/** GitHub's authorize page for this state: the person approves reading their login and verified emails. */
export const authorizeUrl = (ctx: ServiceContext, state: string) => app(ctx, "GitHub connect link")(async (id) =>
  `${web()}/login/oauth/authorize?${new URLSearchParams({ client_id: id, redirect_uri: redirectUri(), scope: SCOPES, state, allow_signup: "false" })}`);

export type GitHubUser = { login: string; githubId: number; emails: string[] };

/** A GitHub reply that isn't what GitHub documents, or that GitHub refused: never read as data. */
export class GitHubReplyError extends Error {}

const Token = z.object({ access_token: z.string().min(1) });
const User = z.object({ login: z.string().regex(/^[A-Za-z0-9-]{1,39}$/), id: z.number().int().positive() });
const Emails = z.array(z.object({ email: z.string().email(), verified: z.boolean() }));

/** Review round 1: each call to GitHub times out, and its reply must match its schema. */
async function call<T>(schema: z.ZodType<T>, what: string, url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => { throw new GitHubReplyError(`GitHub didn't answer for ${what}`); });
  if (!r.ok) throw new GitHubReplyError(`GitHub refused ${what}`);
  const parsed = schema.safeParse(await r.json().catch(() => null));
  if (!parsed.success) throw new GitHubReplyError(`GitHub's reply for ${what} wasn't readable`);
  return parsed.data;
}

/** The code GitHub returned, exchanged for a token that reads the user and their verified emails, then dropped (AC-3). */
export const readGitHubUser = (ctx: ServiceContext, code: string) => app(ctx, "GitHub connect")(async (id, secret): Promise<GitHubUser> => {
  const t = await call(Token, "the sign-in", `${web()}/login/oauth/access_token`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: id, client_secret: secret, code, redirect_uri: redirectUri() }) });
  const headers = { accept: "application/vnd.github+json", authorization: `Bearer ${t.access_token}` };
  const user = await call(User, "your profile", `${api()}/user`, { headers });
  const emails = await call(Emails, "your emails", `${api()}/user/emails`, { headers });
  return { login: user.login, githubId: user.id, emails: emails.filter((e) => e.verified).map((e) => e.email) };
});
