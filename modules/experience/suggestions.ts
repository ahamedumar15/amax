import { sql } from "drizzle-orm";
import { z } from "zod";
import type { EventHandlerDef } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { defineSuggestionKind } from "@amax/agents";
import { createSuggestion, SuggestionError } from "@amax/agents/server";
import { EVENTS, FIX_KIND, JOBS, MIN_GROUP, type FixAccepted } from "./contracts";
import { fixDetail, fixTitle, issues } from "./server/phrases";
import { by, FIX, todayOf } from "./server/read";

// AC-5: an issue on 5 or more devices is the experience agent's suggestion for IT. Accepting an app
// fix queues its Intune remediation (run only as the tenant allows); accepting a hardware fix marks
// it for a helpdesk ticket, raised through helpdesk's own chat intent. Nothing runs without approval.
export const Proposed = z.object({ issueId: z.uuid(), fix: z.enum(["remediation", "ticket"]) });
type Proposed = z.infer<typeof Proposed>;

export const fixKind = defineSuggestionKind<Proposed, { remediationId: string | null }>({
  kind: FIX_KIND, title: "Fix a device or app issue", permission: FIX, proposed: Proposed, jobs: [JOBS.collect],
  async apply(tx, ctx, p) {
    const [i] = await tx.execute(sql`update experience.issue set status = 'accepted' where id = ${p.issueId} and status = 'open' returning devices`);
    if (!i) throw new SuggestionError("that issue isn't open any more");
    const [r] = p.fix === "remediation" ? await tx.execute(sql`insert into experience.remediation (tenant_id, issue_id, approved_by) values (${ctx.tenantId}, ${p.issueId}, ${by(ctx)}) returning id`) : [];
    const payload: FixAccepted = { issueId: p.issueId, fix: p.fix, devices: Number(i.devices), by: by(ctx) };
    return { applied: { remediationId: (r?.id as string | undefined) ?? null }, action: "experience.fix.accept", resource: "experience.issue", resourceId: p.issueId, before: { status: "open" }, after: { status: "accepted", fix: p.fix },
      events: [{ name: EVENTS.fixAccepted, payload }] };
  },
  async undo(tx, _ctx, p, a) {
    if (a.remediationId) {
      const [r] = await tx.execute(sql`update experience.remediation set status = 'cancelled' where id = ${a.remediationId} and status = 'queued' returning id`);
      if (!r) throw new SuggestionError("the remediation has already run");
    }
    await tx.execute(sql`update experience.issue set status = 'open' where id = ${p.issueId} and status = 'accepted'`);
    return { applied: null, action: "experience.fix.undo", resource: "experience.issue", resourceId: p.issueId, after: { status: "open" } };
  },
});

/** After a collection: each open issue on 5 or more devices without a suggestion gets one, with its evidence. */
export const suggestFixes: EventHandlerDef = {
  id: "experience.suggest-fixes",
  event: EVENTS.collected,
  async handle({ tx, tenantId }) {
    const today = await todayOf(tx);
    for (const i of await issues(tx, sql`status = 'open' and suggestion_id is null and devices >= ${MIN_GROUP}`)) {
      const title = fixTitle(i);
      const s = await createSuggestion(contextFor.job(tenantId, JOBS.collect), {
        kind: FIX_KIND, target: { type: "experience.issue", id: i.id, label: title }, title, detail: fixDetail(i, today), proposed: { issueId: i.id, fix: i.fix } satisfies Proposed,
        confidence: i.confidence, agentName: "Experience agent", expiresInDays: 14,
        evidence: [{ type: "record", label: `${i.devices} devices affected, first seen ${i.firstSeen}`, ref: "/experience" }, { type: "record", label: `Likely cause: ${i.cause}`, ref: "/experience" }],
      });
      await tx.execute(sql`update experience.issue set suggestion_id = ${s.id} where id = ${i.id}`);
    }
  },
};

/** A dismissed fix closes its issue, so it isn't suggested again until it comes back. */
export const closeOnDismiss: EventHandlerDef = {
  id: "experience.close-on-dismiss",
  event: "agents.suggestion.decided",
  async handle({ tx, event }) {
    const e = event.payload as { suggestionId?: string; decision?: string; kind?: string };
    if (e.kind !== FIX_KIND || e.decision !== "dismissed" || !e.suggestionId) return;
    await tx.execute(sql`update experience.issue set status = 'done' where suggestion_id = ${e.suggestionId} and status = 'open'`);
  },
};
