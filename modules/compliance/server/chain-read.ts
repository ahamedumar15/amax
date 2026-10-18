import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { iso, type Row } from "./context";

export type ChainCheck = {
  id: string; checkedAt: string; ok: boolean; events: number; headSeq: number | null;
  brokenAt: number | null; reason: string | null; brokenAction: string | null; brokenResource: string | null; source: string;
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export const toChainCheck = (r: Row): ChainCheck => ({
  id: r.id as string, checkedAt: iso(r.checked_at)!, ok: Boolean(r.ok), events: Number(r.events), headSeq: num(r.head_seq),
  brokenAt: num(r.broken_at), reason: (r.reason as string | null) ?? null, brokenAction: (r.broken_action as string | null) ?? null,
  brokenResource: (r.broken_resource as string | null) ?? null, source: r.source as string,
});

export const chainChecks = async (tx: Tx, limit: number) =>
  (await tx.execute(sql`select * from compliance.chain_check order by checked_at desc limit ${limit}`)).map(toChainCheck);

/** "Broken at event 1,204 (leave.request.create on leave.request): hash mismatch". */
export const brokenLabel = (c: Pick<ChainCheck, "brokenAt" | "reason" | "brokenAction" | "brokenResource">) =>
  `Broken at event ${(c.brokenAt ?? 0).toLocaleString("en-US")}${c.brokenAction ? ` (${c.brokenAction} on ${c.brokenResource})` : ""}: ${c.reason}`;
