import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import { CLAIM, loadClaim, read, sees } from "./read";
import { receiptLink } from "./receipts";
import { claimRow } from "./rows";

export const listClaims = (v: Viewer, status?: string) =>
  read(v, async (tx) => (await tx.execute(sql`${CLAIM} ${status ? sql`where c.status = ${status}` : sql``} order by c.spent_on desc, c.number desc`)).filter((c) => sees(v, c)).map((c) => claimRow(v, c)));

export const getClaim = (v: Viewer, claimId: string) =>
  read(v, async (tx) => {
    const c = await loadClaim(tx, claimId).catch(() => null);
    if (!c || !sees(v, c)) return null;
    const row = claimRow(v, c);
    const [r] = c.receipt_id ? await tx.execute(sql`select storage_key from expenses.receipt where id = ${c.receipt_id}`) : [];
    const link = row.merchant === c.merchant ? await receiptLink((r?.storage_key as string | null) ?? null) : null;
    return { ...row, submittedBy: c.submitted_by, managerDecidedBy: c.manager_decided_by, financeDecidedBy: c.finance_decided_by, paidBy: c.paid_by, paidReference: c.paid_reference, receiptUrl: link };
  });
