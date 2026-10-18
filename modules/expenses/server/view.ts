import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import { categoriesIn, type CategoryView } from "./categories";
import { CLAIM, money, read, sees } from "./read";
import { claimRow, type ClaimView } from "./rows";

export type Tile = { count: number; note: string };
export type Expenses = { lede: string; waiting: Tile; toPay: Tile; flagged: Tile; decide: ClaimView[]; claims: ClaimView[]; categories: CategoryView[] };

const OPEN = ["submitted", "manager_approved"];
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function sum(rows: ClaimView[], none: string) {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.currency, (totals.get(r.currency) ?? 0) + Number(r.amount));
  return totals.size ? [...totals].map(([c, n]) => money(n, c)).join(" and ") : none;
}

function ledeOf(decide: ClaimView[], claims: ClaimView[]) {
  const over = decide.filter((c) => c.overLimit);
  const mine = claims.filter((c) => c.mine && OPEN.includes(c.status));
  if (!decide.length) return mine.length ? `${plural(mine.length, "claim")} of yours ${mine.length === 1 ? "is" : "are"} on the way to approval.` : "Nothing waits for you. Claim an expense through amax.";
  const first = over[0] ? ` ${over[0].personName.split(" ")[0]}'s ${over[0].categoryName.toLowerCase()} claim is over its ${over[0].limitText} limit.` : "";
  return `${plural(decide.length, "claim")} ${decide.length === 1 ? "waits" : "wait"} for your decision.${first}`;
}

export async function getExpenses(v: Viewer): Promise<Expenses> {
  return read(v, async (tx) => {
    const rows = (await tx.execute(sql`${CLAIM} order by c.spent_on desc, c.number desc`)).filter((c) => sees(v, c)).map((c) => claimRow(v, c));
    const decide = rows.filter((c) => c.step);
    const claims = rows.filter((c) => !c.step);
    const toPay = rows.filter((c) => c.status === "approved");
    const flagged = rows.filter((c) => c.overLimit && OPEN.includes(c.status));
    return {
      lede: ledeOf(decide, claims), decide, claims, categories: await categoriesIn(tx),
      waiting: { count: decide.length, note: sum(decide, "Nothing to decide") },
      toPay: { count: toPay.length, note: sum(toPay, "Nothing approved and unpaid") },
      flagged: { count: flagged.length, note: flagged.length ? `${flagged.map((c) => c.number).join(", ")} awaiting a decision` : "Every open claim is within its limit" },
    };
  });
}
