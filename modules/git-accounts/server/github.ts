import { loadEnv } from "@amax/core/env";
import { useSecret } from "@amax/core/secrets";
import type { ServiceContext } from "@amax/core/server";

// 108: GitHub's OAuth app, the one place amax talks to GitHub for a person's accounts. Its client id and secret are one
// 031 credential (`github-oauth`, "<client id>:<client secret>"), never env; the URLs may point at a fake GitHub in tests.
export const SCOPES = "read:user user:email";
const web = () => (loadEnv().AMAX_GITHUB_URL ?? "https://github.com").replace(/\/$/, "");
const api = () => (loadEnv().AMAX_GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "");
export const redirectUri = () => `${(loadEnv().AMAX_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/git/github/callback`;

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

const json = async (r: Response, what: string) => {
  if (!r.ok) throw new Error(`GitHub refused ${what} (${r.status})`);
  return r.json();
};

/** The code GitHub returned, exchanged for a token that reads the user and their verified emails, then dropped (AC-3). */
export const readGitHubUser = (ctx: ServiceContext, code: string) => app(ctx, "GitHub connect")(async (id, secret): Promise<GitHubUser> => {
  const t = await json(await fetch(`${web()}/login/oauth/access_token`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: id, client_secret: secret, code, redirect_uri: redirectUri() }) }), "the sign-in");
  if (!t.access_token) throw new Error(`GitHub refused the sign-in: ${String(t.error_description ?? t.error ?? "no token")}`);
  const auth = { accept: "application/vnd.github+json", authorization: `Bearer ${t.access_token}` };
  const user = await json(await fetch(`${api()}/user`, { headers: auth }), "your profile");
  const emails = (await json(await fetch(`${api()}/user/emails`, { headers: auth }), "your emails")) as { email: string; verified: boolean }[];
  return { login: String(user.login), githubId: Number(user.id), emails: emails.filter((e) => e.verified).map((e) => e.email) };
});
