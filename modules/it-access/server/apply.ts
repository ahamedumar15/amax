import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@amax/db";
import { safeRequest } from "@amax/api/egress";
import { contextFor, defineService, getRuntime, type ServiceContext } from "@amax/core/server";
import { EVENTS, WRITE_CONNECTOR, type ChangeApplied } from "../contracts";
import { writeScopes } from "./consent";
import { GRAPH, graphToken } from "./graph";
import { openSecret } from "./sync";
import { effect } from "./changes";
import { actorOf, today } from "./read";

/** What an approved change carries to the write step: the Entra user and the Graph licences (skuIds). */
export type ChangeDetail = { externalUserId: string | null; skuIds: string[]; products: string[]; graph: boolean };
type Queued = { id: string; action: "grant" | "revoke" | "remove-seat" | "restore"; detail: ChangeDetail };

const LICENCES = "LicenseAssignment.ReadWrite.All";
const SESSIONS = "User.RevokeSessions.All";
const needs = (c: Queued) => (c.action === "revoke" ? [LICENCES, SESSIONS] : [LICENCES]);

/** Why a change is left to IT by hand, or null when the write registration may make it. */
export function manualReason(c: Queued, scopes: string[]): string | null {
  if (!scopes.length) return "The write registration is off for this tenant: make the change in the admin centre; the next sync confirms it";
  const missing = needs(c).filter((s) => !scopes.includes(s));
  if (missing.length) return `The write registration wasn't consented for ${missing.join(" and ")}: make the change by hand`;
  if (!c.detail.graph || !c.detail.externalUserId) return `${c.detail.products.join(", ") || "This product"} isn't managed through Microsoft Graph: make the change in its admin page`;
  return null;
}

async function callGraph(value: string, c: Queued, signal: AbortSignal) {
  const token = await graphToken(value, WRITE_CONNECTOR, signal);
  const post = async (path: string, body: unknown) => {
    const r = await safeRequest(`${GRAPH}/users/${encodeURIComponent(c.detail.externalUserId!)}/${path}`, { body: JSON.stringify(body), signal, headers: { "content-type": "application/json", authorization: `Bearer ${token}` } });
    if (r.status < 200 || r.status > 299) throw new Error(`Microsoft Graph answered HTTP ${r.status}`);
  };
  const adds = c.action === "grant" || c.action === "restore";
  if (c.action === "revoke") await post("revokeSignInSessions", {});
  await post("assignLicense", { addLicenses: adds ? c.detail.skuIds.map((skuId) => ({ skuId, disabledPlans: [] })) : [], removeLicenses: adds ? [] : c.detail.skuIds });
}

export const recordOutcome = defineService({
  name: "it-access.change.record", action: "it-access:sync", resource: "it_access.change",
  input: z.object({ changeId: z.uuid(), status: z.enum(["applied", "manual", "failed"]), outcome: z.string().max(300) }),
  async run(tx, a, ctx) {
    const [c] = await tx.execute(sql`select * from it_access.change where id = ${a.changeId} and status = 'queued' for update`);
    if (!c) return { result: null, resourceId: a.changeId };
    // Only a change the write registration made changes the records here. A manual one stays pending,
    // showing the access as it still is, until a person confirms it was done (confirm_access_change).
    const detail = a.status === "applied" ? await effect(tx, c as never, actorOf(ctx), today()) : c.detail;
    await tx.execute(sql`update it_access.change set status = ${a.status}, outcome = ${a.outcome}, detail = ${JSON.stringify(detail)}::jsonb,
      applied_at = case when ${a.status} = 'applied' then now() else null end where id = ${a.changeId}`);
    const payload: ChangeApplied = { changeId: a.changeId, action: c.action as ChangeApplied["action"], status: a.status };
    return { result: payload, resourceId: a.changeId, after: { status: a.status }, events: [{ name: EVENTS.changeApplied, payload }] };
  },
});

async function applyOne(ctx: ServiceContext, c: Queued, scopes: string[], signal: AbortSignal) {
  const manual = manualReason(c, scopes);
  if (manual) return recordOutcome(ctx, { changeId: c.id, status: "manual", outcome: manual });
  try {
    await openSecret(ctx, WRITE_CONNECTOR, `approved access change ${c.id}`, (value) => callGraph(value, c, signal));
    return recordOutcome(ctx, { changeId: c.id, status: "applied", outcome: "Made through the write registration" });
  } catch (e) {
    return recordOutcome(ctx, { changeId: c.id, status: "failed", outcome: (e instanceof Error ? e.message : "failed").replace(/^secrets: /, "").slice(0, 300) });
  }
}

/** AC-1, AC-2: makes the approved changes that are due. `msgraph-write` is opened only here, per change. */
export async function applyDue(tenantId: string, signal = AbortSignal.timeout(120_000)) {
  const ctx = contextFor.job(tenantId, "it-access.apply");
  const { due, scopes } = await withTenant(getRuntime().db, tenantId, async (tx) => ({
    due: (await tx.execute(sql`select id, action, detail from it_access.change where status = 'queued' and effective_on <= ${today()} order by approved_at limit 50`)) as unknown as Queued[],
    scopes: await writeScopes(tx),
  }));
  const out = [];
  for (const c of due) out.push(await applyOne(ctx, c, scopes, signal));
  return out;
}
