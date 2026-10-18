import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { EventHandlerDef } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { createSuggestion } from "@amax/agents/server";
import { EVENTS as HR, getPerson, type PersonLeft } from "@amax/hr/contracts";
import { EVENTS as ONBOARDING, type AccessRequested } from "@amax/onboarding/contracts";
import { grantKind, revokeKind } from "../suggestions";
import { today } from "./read";

/** The licence a joiner gets when onboarding asks for access (fixtures.md: everyone has Microsoft 365 E3). */
export const JOINER_PRODUCT = "m365-e3";
const AGENT = "Access agent";
const DAY = 86_400_000;

/** AC-3: revoke everything the person holds on their last day. IT approves; the change waits for the day. */
async function proposeRevoke(tx: Tx, tenantId: string, personId: string, lastDay: string, source: string) {
  const [a] = await tx.execute(sql`select id, display_name, legal_entity_id from it_access.account where person_id = ${personId} and status = 'active'`);
  if (!a) return;
  const days = Math.ceil((Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / DAY);
  await createSuggestion(contextFor.job(tenantId, "it-access.leavers"), {
    kind: revokeKind.kind, target: { type: "it_access.account", id: a.id as string, label: a.display_name as string },
    title: `Revoke ${a.display_name as string}'s access on their last day, ${lastDay}`,
    detail: `${source} Accept to revoke their sign-in sessions, licences, groups and admin roles at the end of ${lastDay}; undo restores them.`,
    proposed: { accountId: a.id, account: a.display_name, lastDay }, confidence: 1, agentName: AGENT, scope: { legalEntityId: (a.legal_entity_id as string | null) ?? null },
    evidence: [{ type: "record", label: "Leaver in HR", ref: `/it-access?people=leavers` }], expiresInDays: Math.min(30, Math.max(7, days + 7)),
  });
}

export const leaverAgent: EventHandlerDef = {
  id: "it-access.leaver",
  event: HR.personLeft,
  async handle({ tx, tenantId, event }) {
    const e = event.payload as PersonLeft;
    await proposeRevoke(tx, tenantId, e.personId, e.leftOn.slice(0, 10), "HR recorded that they leave.");
  },
};

/** 013 (optional): onboarding's access request becomes the same suggestion, deduplicated with the one above. */
export const onboardingAccess: EventHandlerDef = {
  id: "it-access.onboarding",
  event: ONBOARDING.accessRequested,
  async handle({ tx, tenantId, event }) {
    const e = event.payload as AccessRequested;
    const ctx = contextFor.job(tenantId, "it-access.onboarding");
    const p = await getPerson(tx, ctx, e.personId);
    if (!p) return;
    if (e.kind === "revoke") return proposeRevoke(tx, tenantId, p.id, p.leftOn ?? today(), "Onboarding started their leaver checklist.");
    const [a] = await tx.execute(sql`insert into it_access.account (tenant_id, legal_entity_id, person_id, user_id, display_name, kind) values (${tenantId}, ${p.legalEntityId}, ${p.id}, ${e.userId}, ${p.name}, 'employee')
      on conflict (tenant_id, person_id) do update set display_name = excluded.display_name returning id`);
    const [product] = await tx.execute(sql`select id, name from it_access.product where key = ${JOINER_PRODUCT}`);
    if (!product) return;
    await createSuggestion(ctx, {
      kind: grantKind.kind, target: { type: "it_access.grant", id: `${a.id as string}:${product.id as string}`, label: p.name }, title: `Give ${p.name} ${product.name as string} for their first day`,
      detail: "Onboarding started their joiner checklist. Accept to assign the licence; undo removes it.", proposed: { accountId: a.id, productId: product.id, account: p.name, product: product.name },
      confidence: 0.9, agentName: AGENT, scope: { legalEntityId: e.legalEntityId }, evidence: [{ type: "record", label: "Joiner checklist", ref: "/onboarding" }],
    });
  },
};
