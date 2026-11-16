import { ToolError } from "@amax/mcp";
import { listCredentials, putSecret, useSecret } from "@amax/core/secrets";
import type { ServiceContext } from "@amax/core/server";
import { APP_INCOMPLETE, NO_KEY_SERVICE, NOT_SET_UP } from "../words";

// 116: the GitHub app's credential, "<client id>:<client secret>" (connector github-oauth). Errors raised inside a secret's
// use are rebuilt by its scrub, so they are named there and turned into refusals here, where chat can show their words.
const REFUSALS: Record<string, string> = { SecretNotConfiguredError: NOT_SET_UP, GitHubAppIncomplete: APP_INCOMPLETE, SecretsUnavailableError: NO_KEY_SERVICE };
export const asRefusal = (e: unknown): never => {
  const name = e instanceof Error ? e.name : "";
  throw Object.hasOwn(REFUSALS, name) ? new ToolError(REFUSALS[name], "invalid_input") : e;
};

const incomplete = () => Object.assign(new Error("incomplete"), { name: "GitHubAppIncomplete" });

/** The app's client id and secret; the secret is everything after the first colon (108 final pass). */
export const app = (ctx: ServiceContext, purpose: string) => <T>(fn: (id: string, secret: string) => Promise<T>) =>
  useSecret(ctx, { connector: "github-oauth", purpose }, (s) => {
    const value = s.reveal();
    const at = value.indexOf(":");
    if (at <= 0 || at === value.length - 1) throw incomplete();
    return fn(value.slice(0, at), value.slice(at + 1));
  }).catch(asRefusal);

/** The app's client id, read before any write: it isn't secret, but it lives in the credential. */
export const clientIdOf = (ctx: ServiceContext) => app(ctx, "GitHub connect link")(async (id) => id);

/** AC-1: a client id as GitHub shows it, never a placeholder; a secret of one piece. */
export function checkClientId(id: string) {
  if (!/^[^\s<>:]{4,100}$/.test(id)) throw new ToolError("the Client ID is the one GitHub shows on the app's page, without spaces, <, > or :", "invalid_input", "clientId");
}
export function checkClientSecret(secret: string | undefined) {
  if (!secret || secret.length < 20 || /[\s:]/.test(secret)) throw new ToolError("the Client secret is the 40-character value GitHub generates, without spaces or :", "invalid_input");
  return secret;
}

/** AC-1: adds the app, or replaces it keeping its expiry while that is still ahead. */
export async function storeGitHubApp(ctx: ServiceContext, clientId: string, secret: string) {
  const row = (await listCredentials(ctx).catch(asRefusal)).rows.find((r) => r.connector === "github-oauth" && r.status !== "revoked");
  const expiresAt = row?.expiresAt && row.expiresAt > new Date() ? row.expiresAt.toISOString() : null;
  return putSecret(ctx, { connector: "github-oauth", value: `${clientId}:${secret}`, expiresAt, ...(row ? { graceHours: 72 } : {}) }).catch(asRefusal);
}

export const hasGitHubApp = async (ctx: ServiceContext) =>
  Boolean((await listCredentials(ctx).catch(asRefusal)).rows.find((r) => r.connector === "github-oauth" && r.status !== "revoked"));
