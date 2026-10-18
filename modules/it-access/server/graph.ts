import { safeRequest } from "@amax/api/egress";
import type { Snapshot, SyncSource } from "../sources";
import { allPages, parseSecret, SourceError } from "./http";

/** The msgraph-read and msgraph-write secrets are JSON: the Entra tenant, the app's client id and secret. */
export type GraphApp = { tenant: string; clientId: string; clientSecret: string };
export const GRAPH = "https://graph.microsoft.com/v1.0";

export async function graphToken(value: string, what: string, signal: AbortSignal) {
  const c = parseSecret<GraphApp>(value, ["tenant", "clientId", "clientSecret"], what);
  const body = new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }).toString();
  const r = await safeRequest(`https://login.microsoftonline.com/${encodeURIComponent(c.tenant)}/oauth2/v2.0/token`, { body, signal, headers: { "content-type": "application/x-www-form-urlencoded" } });
  if (r.status < 200 || r.status > 299) throw new SourceError("Microsoft sign-in", r.status);
  return (JSON.parse(r.body) as { access_token: string }).access_token;
}

type Sku = { skuId: string; prepaidUnits: { enabled: number } };
type User = { id: string; signInActivity?: { lastSignInDateTime?: string | null } };
type Role = { displayName: string; members: { id: string }[] };
type Device = { id: string; deviceName: string; operatingSystem: string; osVersion?: string; complianceState: string; userId?: string | null };

// AC-1: licences (subscribedSkus), Entra sign-ins and admin roles, and Intune devices, read-only.
export const graphSource: SyncSource = {
  id: "graph", label: "Microsoft Graph", connector: "msgraph-read",
  async fetch(secret, signal): Promise<Snapshot> {
    const h = { authorization: `Bearer ${await graphToken(secret, "msgraph-read", signal)}` };
    const [skus, users, roles, devices] = await Promise.all([
      allPages<Sku>(`${GRAPH}/subscribedSkus`, h, signal),
      allPages<User>(`${GRAPH}/users?$select=id,signInActivity&$top=999`, h, signal),
      allPages<Role>(`${GRAPH}/directoryRoles?$expand=members($select=id)`, h, signal),
      allPages<Device>(`${GRAPH}/deviceManagement/managedDevices?$select=id,deviceName,operatingSystem,osVersion,complianceState,userId`, h, signal),
    ]);
    const rolesOf = (id: string) => roles.filter((r) => r.members.some((m) => m.id === id)).map((r) => r.displayName);
    return {
      products: skus.map((s) => ({ externalId: s.skuId, seats: s.prepaidUnits.enabled })),
      accounts: users.map((u) => ({ externalId: u.id, lastActiveOn: u.signInActivity?.lastSignInDateTime?.slice(0, 10) ?? null, adminRoles: rolesOf(u.id) })),
      devices: devices.map((d) => ({ externalId: d.id, name: d.deviceName, os: [d.operatingSystem, d.osVersion].filter(Boolean).join(" "), compliant: d.complianceState === "compliant", ownerExternalId: d.userId ?? null })),
    };
  },
};
