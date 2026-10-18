import type { Viewer } from "@amax/auth";
import { canSeePricing } from "@amax/auth";
import { deviceStats, personRows, productRows, type PersonRow, type ProductRow } from "./rows";
import type { FilterId } from "./filters";
import { priced, read, today } from "./read";
import { waitingRows } from "./waiting";

/** The licence agent proposes a removal once a product has this many idle seats. */
export const SAVING_MIN_SEATS = 5;
/** How sure the licence agent is: an idle seat (no sign-in for 60 days) or an add-on never used. */
export const CONFIDENCE = { idle: 0.92, "never-used": 0.85 } as const;

const attention = (p: PersonRow) => (p.adminRoles.length ? 0 : p.kind === "contractor" && p.status === "active" ? 1 : p.status === "left" ? 2 : 3);
const holds = (p: PersonRow) => p.licences > 0 || p.entraGroups > 0 || p.adminRoles.length > 0;

export function peopleFor(rows: PersonRow[], filter: FilterId, on = today()) {
  const pick: Record<FilterId, (p: PersonRow) => boolean> = {
    everyone: () => true, admins: (p) => p.adminRoles.length > 0, leavers: (p) => p.status === "left", contractors: (p) => p.kind === "contractor",
  };
  const order = (a: PersonRow, b: PersonRow) => attention(a) - attention(b) || (b.leftOn ?? "").localeCompare(a.leftOn ?? "") || a.name.localeCompare(b.name);
  return { rows: rows.filter(pick[filter]).sort(order), leaversWithAccess: rows.filter((p) => p.status === "left" && (p.leftOn ?? on) <= on && holds(p)).length };
}

function totalsOf(products: ProductRow[]) {
  const top = products.slice(0, 3);
  const rest = products.slice(3).reduce((n, p) => n + p.monthlyUsd, 0);
  const unusedUsd = products.reduce((n, p) => n + p.unusedUsd, 0);
  return {
    products: products.length, monthlyUsd: products.reduce((n, p) => n + p.monthlyUsd, 0), unused: products.reduce((n, p) => n + p.idle, 0), unusedUsd, yearlyUsd: unusedUsd * 12,
    spend: [...top.map((p) => ({ id: p.id as string | null, name: p.name, spendUsd: p.monthlyUsd })), ...(rest ? [{ id: null, name: "Other", spendUsd: rest }] : [])],
  };
}

export const savingsOf = (products: ProductRow[]) => products.filter((p) => p.idle >= SAVING_MIN_SEATS).sort((a, b) => b.idle - a.idle).map((p) => ({
  productId: p.id, name: p.name, logo: p.logo, color: p.color, idle: p.idle, rule: p.idleRule, confidence: CONFIDENCE[p.idleRule], yearlyUsd: p.unusedUsd * 12,
}));

/** The whole screen: products and spend, savings, devices, and people for one filter. Money only with `pricing`. */
export const accessView = (v: Viewer, filter: FilterId = "everyone") => read(v, async (tx) => {
  const products = await productRows(tx);
  const people = peopleFor(await personRows(tx), filter);
  return priced(v, {
    pricing: canSeePricing(v), filter, products, totals: totalsOf(products), savings: savingsOf(products), devices: await deviceStats(tx),
    people: people.rows, leaversWithAccess: people.leaversWithAccess, waiting: await waitingRows(tx),
  });
});
export type AccessView = Awaited<ReturnType<typeof accessView>>;
