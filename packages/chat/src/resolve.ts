import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
import { toolFailure } from "@amax/ai";
import { logError } from "@amax/core/server";
import type { PinnedRecord } from "@amax/core";
import type { Registry, RegisteredTool } from "@amax/mcp";
import type { Viewer } from "@amax/auth";
import { getConversation, type Conversation } from "./history";
import { UNAVAILABLE, type Pin } from "./pins";

/** A pin as read now: the pin to keep (its label refreshed, or moved onto its id) and what the model is sent. */
export type ResolvedPin = { pin: Pin; record: unknown; tool?: RegisteredTool };

const GONE = { unavailable: "no longer available" };

// A pin made before facets (057 and earlier) carries its part only in its label: "CON v2.4.0
// proposals" is the release's label plus " proposals". Kept as the facet while the two still agree.
const facetOf = (pin: Pin, label: string) => pin.facet ?? (pin.label.startsWith(label) ? pin.label.slice(label.length) : "");

const relabelled = (pin: Pin, rec: PinnedRecord, args: Record<string, unknown>): Pin => {
  const facet = facetOf(pin, rec.label);
  return { label: `${rec.label}${facet}`, tool: pin.tool, args, ...(facet ? { facet } : {}) };
};

/**
 * Reads each pin with the viewer's own permissions (059). A record's pin takes the record's label as
 * it is now, so a rename by chat, MCP, an agent or the sync shows everywhere with nothing rewritten.
 * A pin that names a record by a name or key (every pin before 059) is moved onto the record's id,
 * once: when the name no longer finds a record, or finds one made after `savedAt` (the name was
 * reused after a rename or a rekey), it becomes "No longer available" and is never read again.
 */
export async function resolvePins(registry: Registry, viewer: Viewer, pins: Pin[], savedAt?: Date): Promise<ResolvedPin[]> {
  const readable = registry.toolsFor(viewer, ["read"]);
  return Promise.all(pins.map(async (pin): Promise<ResolvedPin> => {
    if (pin.unavailable) return { pin, record: GONE };
    // A pin that can't be read is still sent, as a fixed marker: the model must not answer as if it
    // had the record, and an error message never reaches it (it can echo values; final review).
    const tool = readable.find((t) => t.name === pin.tool);
    if (!tool) return { pin, record: { unavailable: "not available to this user" } };
    let failed = false;
    const record = await registry.call(viewer, pin.tool, pin.args, { scopes: ["read"], source: "chat" })
      .catch((e: unknown) => { failed = true; return { unavailable: toolFailure(pin.tool, e, logError(`chat.pin ${pin.tool}`, e)) }; });
    const spec = tool.pin;
    if (failed || !spec || spec === "view") return { pin, record, tool };
    const rec = (spec.of as (r: unknown) => PinnedRecord | null)(record);
    if (typeof pin.args[spec.id] === "string") return { pin: rec ? relabelled(pin, rec, pin.args) : pin, record, tool };
    const reused = rec?.createdAt && savedAt && Date.parse(rec.createdAt) > savedAt.getTime();
    if (!rec || reused) return { pin: { ...pin, label: UNAVAILABLE, unavailable: true }, record: GONE, tool };
    return { pin: relabelled(pin, rec, { [spec.id]: rec.id }), record, tool };
  }));
}

const changed = (a: Pin[], b: Pin[]) => JSON.stringify(a) !== JSON.stringify(b);

/**
 * The pins of a saved conversation as read now, saved back when any changed (059: lazy migration).
 * Chat's own transcript state, owner-scoped like the rest of chat.conversation. `updated_at` stays:
 * it says when the person last used the conversation, and it is the `savedAt` of its pins.
 */
export async function refreshSaved(db: Db, registry: Registry, viewer: Viewer, id: string, pins: Pin[], savedAt: Date): Promise<Pin[]> {
  const fresh = (await resolvePins(registry, viewer, pins, savedAt)).map((r) => r.pin);
  if (!changed(pins, fresh)) return pins;
  // Only if the saved pins are still the ones read: a turn that saved others meanwhile wins.
  await withTenant(db, viewer.tenantId, (tx) => tx.execute(sql`update chat.conversation set pins = ${JSON.stringify(fresh)}::jsonb
    where id = ${id} and user_id = ${viewer.userId} and pins = ${JSON.stringify(pins)}::jsonb`));
  return fresh;
}

/** A saved conversation as the panel reopens it (059): its pins read now, so they show their records' current names. */
export async function openConversation(db: Db, registry: Registry, viewer: Viewer, id: string): Promise<Conversation | null> {
  const c = await getConversation(db, viewer, id);
  return c && { ...c, pins: await refreshSaved(db, registry, viewer, c.id, c.pins, new Date(c.updatedAt)) };
}
