import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import type { SuggestionInput } from "@amax/agents/server";
import { grantKind, removeSeatsKind, revokeKind } from "../suggestions";
import { daysAgo, read, today } from "./read";
import { IDLE_DAYS } from "./rows";

type Ask = { action: "grant" | "revoke" | "remove-seats"; accountId?: string; productId?: string; lastDay?: string; seatIds?: string[] };
const need = <T>(v: T | undefined | null, what: string): T => {
  if (v === undefined || v === null) throw new Error(`name the ${what}`);
  return v;
};

// AC-2: a person asks for a change through chat; it becomes a suggestion acting for them, so (being
// sensitive) someone else in IT has to approve it. Nothing changes here.
export const requestFor = (v: Viewer, a: Ask): Promise<SuggestionInput> => read(v, async (tx) => {
  const one = async (q: ReturnType<typeof sql>, what: string) => need((await tx.execute(q))[0], what);
  const evidence = [{ type: "record" as const, label: "Asked in chat", ref: "/it-access" }];
  const base = { confidence: 1, agentName: "Access agent", source: { channel: "internal" as const, label: "Asked in chat" }, evidence };
  if (a.action === "remove-seats") {
    const p = await one(sql`select id, name from it_access.product where id = ${need(a.productId, "product")}`, "product");
    const seats = a.seatIds?.length ? a.seatIds : (await tx.execute(sql`select id from it_access.seat where product_id = ${p.id} and removed_on is null
      and (last_active_on is null or last_active_on < ${daysAgo(IDLE_DAYS)})`)).map((s) => s.id as string);
    if (!seats.length) throw new Error(`${p.name as string} has no unused seats to remove`);
    return { ...base, kind: removeSeatsKind.kind, target: { type: "it_access.product", id: p.id as string, label: p.name as string }, title: `Remove ${seats.length} seats of ${p.name as string}`,
      proposed: { productId: p.id, product: p.name, seatIds: seats } };
  }
  const acc = await one(sql`select id, display_name, legal_entity_id from it_access.account where id = ${need(a.accountId, "account")}`, "account");
  const target = { type: "it_access.account", id: acc.id as string, label: acc.display_name as string };
  const scope = { legalEntityId: (acc.legal_entity_id as string | null) ?? null };
  if (a.action === "revoke") {
    const lastDay = a.lastDay ?? today();
    return { ...base, kind: revokeKind.kind, target, scope, title: `Revoke ${acc.display_name as string}'s access on ${lastDay}`, proposed: { accountId: acc.id, account: acc.display_name, lastDay } };
  }
  const p = await one(sql`select id, name from it_access.product where id = ${need(a.productId, "product")}`, "product");
  return { ...base, kind: grantKind.kind, target: { ...target, type: "it_access.grant", id: `${acc.id as string}:${p.id as string}` }, scope, title: `Give ${acc.display_name as string} ${p.name as string}`, proposed: { accountId: acc.id, productId: p.id, account: acc.display_name, product: p.name } };
});
