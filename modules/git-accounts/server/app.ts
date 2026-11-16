import { ToolError } from "@amax/mcp";
import { keptExpiryOf, listCredentials, NO_KEY_SERVICE, putSecret, useSecret } from "@amax/core/secrets";
import type { ServiceContext } from "@amax/core/server";
import { APP_INCOMPLETE, NOT_SET_UP } from "../words";

// 116: the GitHub app's credential, "<client id>:<client secret>" (connector github-oauth), written only by set_github_app.
// Errors raised inside a secret's use are rebuilt by its scrub, so they are named there and turned into refusals here.
const REFUSALS: Record<string, (e: Error) => string> = {
  SecretNotConfiguredError: () => NOT_SET_UP, GitHubAppIncomplete: () => APP_INCOMPLETE, SecretsUnavailableError: () => NO_KEY_SERVICE, ExpiryPassedError: (e) => e.message,
};
export const asRefusal = (e: unknown): never => {
  if (e instanceof Error && Object.hasOwn(REFUSALS, e.name)) throw new ToolError(REFUSALS[e.name](e), "invalid_input");
  throw e;
};

const incomplete = () => Object.assign(new Error("incomplete"), { name: "GitHubAppIncomplete" });

/** The app's client id and secret; neither holds a colon (set_github_app checks), so the value splits at its colon. */
export const app = (ctx: ServiceContext, purpose: string) => <T>(fn: (id: string, secret: string) => Promise<T>) =>
  useSecret(ctx, { connector: "github-oauth", purpose }, (s) => {
    const [id, secret, ...rest] = s.reveal().split(":");
    if (!id || !secret || rest.length) throw incomplete();
    return fn(id, secret);
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

/** Review round 1: the one lookup of the app's credential row, for those who manage credentials; revoked counts as none. */
export const appRow = async (ctx: ServiceContext) =>
  (await listCredentials(ctx).catch(asRefusal)).rows.find((r) => r.connector === "github-oauth" && r.status !== "revoked") ?? null;

/** AC-1: adds the app, or replaces it keeping its expiry by the 052 rule unless a new one is given. */
export async function storeGitHubApp(ctx: ServiceContext, input: { clientId: string; secret: string; expiresAt?: string }) {
  const row = await appRow(ctx);
  const expiresAt = input.expiresAt ?? (row ? (() => { try { return keptExpiryOf("github-oauth", row.expiresAt); } catch (e) { return asRefusal(e); } })() : null);
  return putSecret(ctx, { connector: "github-oauth", value: `${input.clientId}:${input.secret}`, expiresAt, ...(row ? { graceHours: 72 } : {}) }).catch(asRefusal);
}
