import { sql } from "drizzle-orm";
import type { EventHandlerDef } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { createSuggestion } from "@amax/agents/server";
import { EVENTS, type SyncCompleted } from "../contracts";
import { removeSeatsKind } from "../suggestions";
import { daysAgo } from "./read";
import { IDLE_DAYS, productRows } from "./rows";
import { CONFIDENCE, savingsOf } from "./view";

export const LICENCE_AGENT = "Licence agent";
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

// AC-2: after each sync, the licence agent proposes removing a product's idle seats (no use for 60
// days, or an add-on never used) once there are enough to matter. It only suggests: IT approves.
// Titles and details carry no prices (055 pricing); the screen shows the saving to Admin.
export const licenceAgent: EventHandlerDef = {
  id: "it-access.licence-agent",
  event: EVENTS.syncCompleted,
  async handle({ tx, tenantId, event }) {
    if ((event.payload as SyncCompleted).status !== "ok") return;
    const ctx = contextFor.job(tenantId, "it-access.licence-agent");
    for (const s of savingsOf(await productRows(tx))) {
      const seats = await tx.execute(sql`select id from it_access.seat where product_id = ${s.productId} and removed_on is null
        and (last_active_on is null or last_active_on < ${daysAgo(IDLE_DAYS)}) order by id`);
      const why = s.rule === "never-used" ? "are held by people who have never used it" : `have had no sign-in for ${IDLE_DAYS} days or more`;
      await createSuggestion(ctx, {
        kind: removeSeatsKind.kind, target: { type: "it_access.product", id: s.productId, label: s.name },
        title: `Remove ${plural(seats.length, "unused seat")} of ${s.name}`, detail: `${plural(seats.length, "seat")} ${why}. Accept to remove them; undo puts them back.`,
        proposed: { productId: s.productId, product: s.name, seatIds: seats.map((x) => x.id as string) }, confidence: CONFIDENCE[s.rule], agentName: LICENCE_AGENT,
        scope: {}, evidence: [{ type: "record", label: `${s.name} seats`, ref: "/it-access" }],
      });
    }
  },
};
