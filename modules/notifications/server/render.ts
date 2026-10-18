import { sql } from "drizzle-orm";
import { textArray, type Tx } from "@amax/db";
import { canSee, type Subject, type Viewer } from "@amax/auth";
import type { NotificationRule, PayloadFields } from "@amax/core";
import type { Sensitivity } from "@amax/core/server";

/** What a recipient sees in place of a value they may not (030 AC-4). */
export const HIDDEN = "•••";
const FIELD = /\{(\w+)(\|name)?\}/g;
type Payload = Record<string, unknown>;
export type Message = { userId: string; title: string; body: string | null; href: string | null };

/** User ids a rule's templates turn into names, looked up once per event. */
export async function namesFor(tx: Tx, rule: NotificationRule, payload: Payload): Promise<Map<string, string>> {
  const text = [rule.title, rule.body ?? "", rule.href ?? ""].join(" ");
  const ids = [...text.matchAll(FIELD)].filter((m) => m[2]).map((m) => String(payload[m[1]] ?? "")).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (!ids.length) return new Map();
  const rows = await tx.execute(sql`select id::text, name from auth.user where id::text = any(${textArray(ids)})`);
  return new Map(rows.map((r) => [r.id as string, r.name as string]));
}

// A field shows only when its emitter declared it plain, or the recipient may see its class. An
// undeclared field is treated as classified, as outgoing webhooks treat it (035).
function visible(viewer: Viewer, cls: Sensitivity | "plain" | undefined, subject: Subject) {
  if (cls === "plain") return true;
  return cls !== undefined && canSee(viewer, cls, subject);
}

export function fill(template: string, payload: Payload, fields: PayloadFields | undefined, viewer: Viewer, subject: Subject, names: Map<string, string>) {
  return template.replace(FIELD, (_m, key: string, name?: string) => {
    if (!visible(viewer, fields?.[key], subject)) return HIDDEN;
    const value = payload[key];
    if (name) return names.get(String(value)) ?? "Someone";
    return value === null || value === undefined ? "" : String(value);
  });
}

/** One recipient's message: every template filled with only what that person may see. */
export function render(rule: NotificationRule, payload: Payload, fields: PayloadFields | undefined, viewer: Viewer, names: Map<string, string>): Message {
  const subject: Subject = { ownerUserId: rule.subject ? String(payload[rule.subject] ?? "") || null : null, legalEntityId: (payload.legalEntityId as string | undefined) ?? null };
  const f = (t: string) => fill(t, payload, fields, viewer, subject, names);
  return { userId: viewer.userId, title: f(rule.title), body: rule.body ? f(rule.body) : null, href: rule.href ? f(rule.href) : null };
}
