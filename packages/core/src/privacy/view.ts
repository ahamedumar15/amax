import { sql } from "drizzle-orm";
import { textArray, withTenant, type Tx } from "@amax/db";
import { authorize, ForbiddenError, type ServiceContext } from "../authorize";
import { getRuntime } from "../service";
import { APPEND_ONLY, PRIVACY_READ, privacyRules, TENANT_DEFAULTS, type Rule } from "./catalog";
import { heldIds } from "./holds";
import { summarise } from "./inventory";
import { paused } from "./match";
import { effective, loadPeriods, type Effective, type Entity } from "./periods";
import { previewPurge } from "./purge";
import { toRequest, type RequestRow } from "./requests";

export type RuleView = Pick<Rule, "id" | "table" | "module" | "class" | "action" | "start"> & Effective & { label: string; paused: boolean };
export type RequestView = RequestRow & { summary: ReturnType<typeof summarise> };
export type Hold = { id: string; kind: "person" | "matter"; label: string; reason: string; placedBy: string; placedAt: string };

export async function readPrivacy<T>(ctx: ServiceContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!(await authorize(ctx, PRIVACY_READ, "privacy.request", {}))) throw new ForbiddenError(PRIVACY_READ, "privacy.request");
  return withTenant(getRuntime().db, ctx.tenantId, fn);
}

export async function listRequests(tx: Tx): Promise<RequestView[]> {
  const rows = await tx.execute(sql`select * from privacy.request order by (status in ('open', 'approved')) desc, opened_at desc limit 50`);
  return rows.map(toRequest).map((r) => ({ ...r, summary: summarise(r.inventory) }));
}

export async function listHolds(tx: Tx): Promise<Hold[]> {
  const rows = await tx.execute(sql`select * from privacy.legal_hold where released_at is null order by placed_at desc`);
  return rows.map((h) => ({ id: h.id as string, kind: h.kind as Hold["kind"], label: h.label as string, reason: h.reason as string, placedBy: h.placed_by as string, placedAt: new Date(h.placed_at as string).toISOString() }));
}

export async function listRules(tx: Tx, entityId?: string | null) {
  const [p, held] = await Promise.all([loadPeriods(tx), heldIds(tx)]);
  const entity: Entity | null = p.entities.find((e) => e.id === entityId) ?? p.entities[0] ?? null;
  const rules: RuleView[] = privacyRules().map((r) => ({ id: r.id, table: r.table, module: r.module, class: r.class, action: r.action, start: r.start, label: r.label ?? r.table, paused: paused(r, held), ...effective(p, r, entity?.id ?? null) }));
  return { entities: p.entities, entity, rules, appendOnly: APPEND_ONLY, defaults: Object.values(TENANT_DEFAULTS).filter((d) => !rules.some((r) => r.label === d.label)) };
}

export async function purgedSince(tx: Tx, days = 30) {
  const rows = await tx.execute(sql`select label, sum(n)::int as n from privacy.purge_log where at > now() - make_interval(days => ${days}) group by label order by 2 desc`);
  return rows.map((r) => ({ label: r.label as string, n: Number(r.n) }));
}

export async function accessPackage(tx: Tx, id: string) {
  const [r] = await tx.execute(sql`select package from privacy.request where id = ${id} and kind = 'access' and status = 'completed' and package is not null`);
  return (r?.package as Record<string, unknown> | undefined) ?? null;
}

export async function names(tx: Tx, actors: string[]) {
  const ids = [...new Set(actors.filter((a) => a.startsWith("user:")).map((a) => a.slice(5)))];
  const rows = ids.length ? await tx.execute(sql`select id::text, name from auth.user where id::text = any(${textArray(ids)})`) : [];
  return Object.fromEntries(rows.map((r) => [`user:${r.id}`, r.name as string]));
}

export async function privacyOverview(ctx: ServiceContext, opts: { entityId?: string | null } = {}) {
  return readPrivacy(ctx, async (tx) => {
    const [rules, preview, requests, holds, purged] = [await listRules(tx, opts.entityId), await previewPurge(tx), await listRequests(tx), await listHolds(tx), await purgedSince(tx)];
    const due = { delete: 0, anonymise: 0 };
    for (const c of preview.counts) due[c.action] += c.n;
    const who = await names(tx, [...requests.flatMap((r) => [r.openedBy, r.approvedBy ?? ""]), ...holds.map((h) => h.placedBy)]);
    return { ...rules, due, dueByRule: preview.counts.filter((c) => c.n > 0), requests, holds, purged, names: who };
  });
}
