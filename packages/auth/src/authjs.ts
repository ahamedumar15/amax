import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { sql } from "drizzle-orm";
import type { Db } from "@amax/db";
import { loadViewer, SESSION_HOURS, signInDemo, signInFromDirectory, SignInDenied, signOutSession } from "./session";

export type AuthDeps = {
  db: Db;
  secret: string;
  /** Fixtures-only "sign in as" for local and CI; refused in production. */
  demo?: { tenantId: string } | null;
  env?: Record<string, string | undefined>;
};

type Stamp = { tenantId: string; userId: string; sessionId: string };
const REVALIDATE_MS = 60_000;

// client_secret_ref is "env:NAME" until 031 secrets lands.
export function resolveSecretRef(ref: string, env: Record<string, string | undefined> = process.env) {
  const name = ref.startsWith("env:") ? ref.slice(4) : null;
  const value = name ? env[name] : undefined;
  if (!value) throw new Error(`amax: identity provider secret ${ref} is not set`);
  return value;
}

export async function listProviders(db: Db) {
  return (await db.execute(sql`select * from auth.list_providers()`)).map((p) => ({
    providerId: p.provider_id as string,
    tenantId: p.tenant_id as string,
    tenantName: p.tenant_name as string,
    issuer: p.issuer as string,
    directoryId: p.directory_id as string,
    clientId: p.client_id as string,
    clientSecretRef: p.client_secret_ref as string,
  }));
}

export const providerIdFor = (tenantProviderId: string) => `entra-${tenantProviderId}`;

// One Entra provider per tenant, so each tenant brings its own app registration. The tenant is
// still decided by the token's iss + tid; the provider only says which tenant it must match.
export async function authConfig(deps: AuthDeps): Promise<NextAuthConfig> {
  const env = deps.env ?? process.env;
  const providers = await listProviders(deps.db);
  const byProvider = new Map(providers.map((p) => [providerIdFor(p.providerId), p]));
  const demo = deps.demo && env.NODE_ENV !== "production" ? deps.demo : null;

  return {
    secret: deps.secret,
    trustHost: true,
    session: { strategy: "jwt", maxAge: SESSION_HOURS * 3600 },
    pages: { signIn: "/signin", error: "/signin" },
    providers: [
      ...providers.map((p) =>
        MicrosoftEntraID({
          id: providerIdFor(p.providerId),
          name: p.tenantName,
          clientId: p.clientId,
          clientSecret: resolveSecretRef(p.clientSecretRef, env),
          issuer: p.issuer,
          authorization: { params: { scope: "openid profile email" } },
        }),
      ),
      ...(demo
        ? [Credentials({
            id: "demo",
            name: "Demo (fixtures)",
            credentials: { email: { label: "Email", type: "email" } },
            async authorize(creds) {
              try {
                const stamp = await signInDemo(deps.db, demo.tenantId, String(creds?.email ?? ""));
                return { id: stamp.userId, amax: stamp } as never;
              } catch (e) {
                if (e instanceof SignInDenied) return null;
                throw e;
              }
            },
          })]
        : []),
    ],
    callbacks: {
      async signIn({ account, profile }) {
        if (!account || account.provider === "demo") return true;
        const p = byProvider.get(account.provider);
        if (!p || !profile) return "/signin?error=AccessDenied";
        try {
          const claims = profile as Record<string, unknown>;
          const stamp = await signInFromDirectory(deps.db, {
            issuer: String(claims.iss ?? ""),
            directoryId: String(claims.tid ?? ""),
            externalId: String(claims.oid ?? claims.sub ?? ""),
            email: String(claims.email ?? claims.preferred_username ?? ""),
            name: String(claims.name ?? ""),
            groups: Array.isArray(claims.groups) ? claims.groups.map(String) : [],
          }, p.tenantId);
          (account as Record<string, unknown>).amax = stamp;
          return true;
        } catch (e) {
          if (e instanceof SignInDenied) return `/signin?error=${e.reason}`;
          throw e;
        }
      },
      // The JWT carries only ids. Every minute it is checked against the session and user rows,
      // so deactivation or sign-out elsewhere ends the browser session within a minute.
      async jwt({ token, account, user }) {
        const stamp = ((account as Record<string, unknown> | null)?.amax ?? (user as Record<string, unknown> | undefined)?.amax) as Stamp | undefined;
        if (stamp) return { ...token, ...stamp, checkedAt: Date.now() };
        if (!token.sessionId) return null;
        if (Date.now() - Number(token.checkedAt ?? 0) < REVALIDATE_MS) return token;
        const viewer = await loadViewer(deps.db, String(token.tenantId), String(token.sessionId));
        return viewer ? { ...token, checkedAt: Date.now() } : null;
      },
      session({ session, token }) {
        return { ...session, amax: { tenantId: token.tenantId, userId: token.userId, sessionId: token.sessionId } } as never;
      },
    },
    events: {
      async signOut(message) {
        const token = "token" in message ? message.token : null;
        if (token?.sessionId) await signOutSession(deps.db, String(token.tenantId), String(token.sessionId));
      },
    },
  };
}

export const sessionStamp = (session: unknown) => (session as { amax?: Partial<Stamp> } | null)?.amax;
