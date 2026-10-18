import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, canEver, contextForViewer, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime, type ServiceContext, type Source } from "@amax/core/server";

export const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!canEver(viewer, "expenses:read")) throw new ForbiddenError("expenses:read", "expenses");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

export const ctxFor = (viewer: Viewer, source: Source = "ui"): ServiceContext => contextForViewer(viewer, source);
export const actorOf = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);

export type Row = Record<string, unknown>;
export const ownerOf = (row: Row) => (row.user_id as string | null) ?? null;
export const reviews = (v: Viewer, row: Row) => can(v, "expenses:review", { legalEntityId: row.legal_entity_id as string });
export const sees = (v: Viewer, row: Row) => {
  const owner = ownerOf(row);
  return (!!owner && (owner === v.userId || v.reports.includes(owner))) || reviews(v, row);
};

export const amt = (v: unknown) => Number(v ?? 0).toFixed(2);
export const money = (v: unknown, currency: string) => {
  const n = Number(v ?? 0);
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
};
export const shortDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const payrollInstalled = async (tx: Tx) => Boolean((await tx.execute(sql`select to_regclass('payroll.run') is not null as on`))[0]?.on);
export const thisMonth = async (tx: Tx) => String((await tx.execute(sql`select to_char(current_date, 'YYYY-MM') as m`))[0].m);

export const CLAIM = sql`select c.*, c.spent_on::text as spent_on, round(c.amount, 2)::text as amount, k.key as category_key, k.name as category_name, k.health,
  round(k.claim_limit, 2)::text as claim_limit, r.filename as receipt_filename from expenses.claim c join expenses.category k on k.id = c.category_id left join expenses.receipt r on r.id = c.receipt_id`;

export async function loadClaim(tx: Tx, id: string, lock = false): Promise<Row> {
  const [c] = await tx.execute(sql`${CLAIM} where c.id = ${id} ${lock ? sql`for update of c` : sql``}`);
  if (!c) throw Object.assign(new Error("no such expense claim"), { code: "not_found" });
  return c;
}
