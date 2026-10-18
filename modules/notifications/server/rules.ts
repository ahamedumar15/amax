import type { EventHandlerDef, ModuleManifest, NotificationRule, PayloadFields } from "@amax/core";
import { contextFor } from "@amax/core/server";
import type { Tx } from "@amax/db";
import { notify } from "./notify";
import { recipientsOf } from "./recipients";
import { namesFor, render } from "./render";

type Bound = { rule: NotificationRule; module: string; moduleTitle: string; fields: PayloadFields | undefined };
type Payload = Record<string, unknown>;

const matches = (rule: NotificationRule, payload: Payload) => Object.entries(rule.when ?? {}).every(([k, v]) => payload[k] === v);

// The emitter's declared payload classes for an event (declarePayload); undeclared fields stay hidden.
const fieldsOf = (modules: ModuleManifest[], event: string) => modules.map((m) => m.events?.payloads?.[event]).find(Boolean);

async function fire(tx: Tx, tenantId: string, eventId: string, b: Bound, payload: Payload) {
  if (!matches(b.rule, payload)) return;
  const [viewers, names] = await Promise.all([recipientsOf(tx, tenantId, b.rule, payload), namesFor(tx, b.rule, payload)]);
  if (!viewers.length) return;
  const messages = viewers.map((v) => render(b.rule, payload, b.fields, v, names));
  await notify(contextFor.job(tenantId, "notifications.rules"), {
    eventId, ruleId: b.rule.id, module: b.module, moduleTitle: b.moduleTitle, urgent: b.rule.urgency === "urgent", category: b.rule.category, messages,
  });
}

/** One outbox handler per event any installed module has a rule for (030 AC-1). */
export function ruleHandlers(modules: ModuleManifest[]): EventHandlerDef[] {
  const byEvent = new Map<string, Bound[]>();
  for (const m of modules) {
    for (const rule of m.notifications ?? []) {
      const bound = { rule, module: m.id, moduleTitle: m.title, fields: fieldsOf(modules, rule.event) };
      byEvent.set(rule.event, [...(byEvent.get(rule.event) ?? []), bound]);
    }
  }
  return [...byEvent].map(([event, rules]) => ({
    id: `notifications.rules:${event}`,
    event,
    async handle({ tx, tenantId, event: e }) {
      for (const b of rules) await fire(tx, tenantId, e.id, b, e.payload);
    },
  }));
}
