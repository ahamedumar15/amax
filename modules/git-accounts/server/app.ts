import { ToolError } from "@amax/mcp";
import { keptExpiryOf, kmsLabel, listCredentials, putSecret, unavailableWords, useSecret } from "@amax/core/secrets";
import type { ServiceContext } from "@amax/core/server";
import { APP_INCOMPLETE, NOT_SET_UP } from "../words";

// 116: the GitHub app's credential, "<client id>:<client secret>" (connector github-oauth), written only by set_github_app.
// Errors raised inside a secret's use are rebuilt by its scrub, so they are named there and turned into refusals here.
const REFUSALS: Record<string, (e: Error) => string> = {
  SecretNotConfiguredError: () => NOT_SET_UP, GitHubAppIncomplete: () => APP_INCOMPLETE, SecretsUnavailableError: (e) => unavailableWords(e, kmsLabel()), ExpiryPassedError: (e) => e.message,
};
export const asRefusal = (e: unknown): never => {
  if (e instanceof Error && Object.hasOwn(REFUSALS, e.name)) throw new ToolError(REFUSALS[e.name](e), "invalid_input");
  throw e;
};

const incomplete = () => Object.assign(new Error("incomplete"), { name: "GitHubAppIncomplete" });

// 117 AC-3: the one rule for a usable "<client id>:<client secret>", for the writer, the reader and the status.
const CLIENT_ID = /^[^\s<>:]{4,100}$/;
const usableSecret = (s: string) => s.length >= 20 && !/[\s:]/.test(s);
export function parseGitHubApp(value: string): { id: string; secret: string } | null {
  const at = value.indexOf(":");
  const [id, secret] = [value.slice(0, at), value.slice(at + 1)];
  return at > 0 && CLIENT_ID.test(id) && usableSecret(secret) ? { id, secret } : null;
}

/** The app's client id and secret, or the clear refusal when the stored value isn't usable. */
export const app = (ctx: ServiceContext, purpose: string) => <T>(fn: (id: string, secret: string) => Promise<T>) =>
  useSecret(ctx, { connector: "github-oauth", purpose }, (s) => {
    const parsed = parseGitHubApp(s.reveal());
    if (!parsed) throw incomplete();
    return fn(parsed.id, parsed.secret);
  }).catch(asRefusal);

/**
 * 117 AC-3: whether the stored value is usable: true, false, or null when it couldn't be read (a key service outage, a
 * refused use), which is never mistaken for "unusable" and never kept. Reading it is an audited use, so a read answer is
 * kept per tenant until the credential is next rotated, one entry per tenant, and concurrent checks share one read.
 */
export type AppCheck = { usable: boolean } | { usable: null; problem: string };
const checks = new Map<string, { rotatedAt: string; answer: Promise<AppCheck> }>();
const problemOf = (e: unknown) => { try { return asRefusal(e); } catch (r) { return r instanceof ToolError ? r.message : "amax couldn't read the GitHub app's credential just now"; } };
export function appUsable(ctx: ServiceContext, rotatedAt: Date | null): Promise<AppCheck> {
  const at = rotatedAt?.toISOString() ?? "";
  const held = checks.get(ctx.tenantId);
  if (held?.rotatedAt === at) return held.answer;
  // Review round 2: a failed read is "couldn't check" with its reason, dropped (if still the held one) so the next status
  // reads again.
  const answer: Promise<AppCheck> = useSecret(ctx, { connector: "github-oauth", purpose: "GitHub app check" }, async (s) => parseGitHubApp(s.reveal()) !== null)
    .then((usable) => ({ usable }), (e: unknown) => {
      if (checks.get(ctx.tenantId)?.answer === answer) checks.delete(ctx.tenantId);
      return { usable: null, problem: problemOf(e) };
    });
  checks.set(ctx.tenantId, { rotatedAt: at, answer });
  return answer;
}

/** The app's client id, read before any write: it isn't secret, but it lives in the credential. */
export const clientIdOf = (ctx: ServiceContext) => app(ctx, "GitHub connect link")(async (id) => id);

/** AC-1: a client id as GitHub shows it, never a placeholder; a secret of one piece. */
export function checkClientId(id: string) {
  if (!CLIENT_ID.test(id)) throw new ToolError("the Client ID is the one GitHub shows on the app's page, without spaces, <, > or :", "invalid_input", "clientId");
}
export function checkClientSecret(secret: string | undefined) {
  if (!secret || !usableSecret(secret)) throw new ToolError("the Client secret is the 40-character value GitHub generates, without spaces or :", "invalid_input");
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
