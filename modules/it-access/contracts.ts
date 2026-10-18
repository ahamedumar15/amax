// The only import surface for other modules (docs/module-standard.md). Reads run in the caller's
// tenant transaction and never return money: other modules get counts, admin roles and review dates
// (036 compliance reads access reviews here; hr's person page can read a person's access).
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { canEver, type Viewer } from "@amax/auth";
import { isSystemContext, type ServiceContext } from "@amax/core/server";

/** The changes IT approves (AC-2): each is a 006 suggestion kind of this module. */
export const ACTIONS = ["grant", "revoke", "remove-seat"] as const;
export type AccessAction = (typeof ACTIONS)[number];

/** AC-1: the 031 connectors. Sync opens only the read ones; approved changes open only `msgraph-write`. */
export const READ_CONNECTORS = ["msgraph-read", "azure-devops", "github"] as const;
export const WRITE_CONNECTOR = "msgraph-write" as const;
/** The Graph scopes the write registration may hold, named per tenant when an Admin consents. */
export const WRITE_SCOPES = ["LicenseAssignment.ReadWrite.All", "User.RevokeSessions.All", "GroupMember.ReadWrite.All"] as const;

export const EVENTS = {
  syncCompleted: "it-access.sync.completed",
  changeQueued: "it-access.change.queued",
  changeApplied: "it-access.change.applied",
  reviewRecorded: "it-access.review.recorded",
  consentChanged: "it-access.consent.changed",
} as const;

export type SyncCompleted = { source: string; status: "ok" | "failed" | "skipped"; products: number; devices: number; by: string };
export type ChangeQueued = { changeId: string; action: AccessAction | "restore"; accountId: string | null; productId: string | null; effectiveOn: string; by: string };
export type ChangeApplied = { changeId: string; action: AccessAction | "restore"; status: "applied" | "manual" | "failed" };
export type ReviewRecorded = { accountId: string; personId: string | null; reviewedOn: string; by: string };
export type ConsentChanged = { enabled: boolean; scopes: string[]; by: string };

/** What one person can use: counts, admin roles and the last review. */
export type PersonAccess = { accountId: string; personId: string; entraGroups: number; licences: number; devices: number; adminRoles: string[]; reviewedOn: string | null; status: "active" | "left" };
export type ReviewStatus = { accounts: number; admins: number; reviewedSince: number; lastReviewOn: string | null };

type Reader = Viewer | ServiceContext;
const allowed = (r: Reader) => ("actor" in r ? (r.viewer ? canEver(r.viewer as Viewer, "it-access:read") : isSystemContext(r)) : canEver(r, "it-access:read"));
const day = (v: unknown) => (v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : null);

/** One person's access, or null when they have no account or the reader may not see it. */
export async function accessOf(tx: Tx, reader: Reader, personId: string): Promise<PersonAccess | null> {
  if (!allowed(reader)) return null;
  const [r] = await tx.execute(sql`select a.*, (select count(*) from it_access.seat s where s.account_id = a.id and s.removed_on is null)::int as licences,
      (select count(*) from it_access.device d where d.account_id = a.id)::int as devices from it_access.account a where a.person_id = ${personId}`);
  if (!r) return null;
  return { accountId: r.id as string, personId, entraGroups: Number(r.entra_groups), licences: Number(r.licences), devices: Number(r.devices), adminRoles: (r.admin_roles as string[]) ?? [], reviewedOn: day(r.reviewed_on), status: r.status as "active" | "left" };
}

/** Access reviews of active accounts since a day (ISO date), for 036's evidence. */
export async function reviewStatus(tx: Tx, reader: Reader, since: string): Promise<ReviewStatus | null> {
  if (!allowed(reader)) return null;
  const [r] = await tx.execute(sql`select count(*)::int as accounts, count(*) filter (where cardinality(admin_roles) > 0)::int as admins,
      count(*) filter (where reviewed_on >= ${since})::int as reviewed, max(reviewed_on) as last from it_access.account where status = 'active'`);
  return { accounts: Number(r.accounts), admins: Number(r.admins), reviewedSince: Number(r.reviewed), lastReviewOn: day(r.last) };
}
