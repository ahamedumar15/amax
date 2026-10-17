import { z } from "zod";
import { accessPackage, completePrivacyRequest, listHolds, listRequests, listRules, openPrivacyRequest, placeLegalHold, PRIVACY_MANAGE, PRIVACY_READ, privacyOverview, purgedSince, readPrivacy, releaseLegalHold, setRetentionPeriod } from "@amax/core/privacy";
import type { Viewer } from "@amax/auth";
import { ToolError } from "@amax/mcp";
import { ctxFor, notFound, read, tool, write } from "./tool";

const entity = z.string().min(1).max(200).describe("A legal entity's id or name; default the first");
const id = z.uuid().describe("The request's id");
const person = z.string().min(1).max(200).describe("The person's email, full name or user id");
const reason = z.string().min(3).max(500);

const ctx = (v: Viewer) => ctxFor(v, "chat");

// Privacy requests open and complete only on chat's confirm card, with a person at the keyboard: never
// over MCP or the REST API, where a credential or agent could act with no confirm (review 058 B10).
function chatOnly(source: string) {
  if (source !== "chat") throw new ToolError("privacy requests are opened and completed only on amax chat's confirm card", "invalid_input");
}
const look = <T>(v: Viewer, fn: Parameters<typeof readPrivacy<T>>[1]) => readPrivacy(ctx(v), fn);

async function entityId(v: Viewer, ref: string | undefined) {
  if (!ref) return null;
  const { entities } = await look(v, (tx) => listRules(tx));
  const hit = entities.find((e) => e.id === ref || e.name.toLowerCase() === ref.trim().toLowerCase());
  if (!hit) throw notFound(`legal entity "${ref}"`);
  return hit.id;
}

async function request(v: Viewer, reqId: string) {
  const hit = (await look(v, listRequests)).find((r) => r.id === reqId);
  return hit ?? Promise.reject(notFound(`privacy request ${reqId}`));
}

export const privacyTools = [
  tool({ ...read(PRIVACY_READ), name: "retention_overview", description: "The Data retention screen: rules with each entity's period, what tonight's purge removes, open requests, legal holds and the last 30 days' purges by class.",
    input: z.object({ entity: entity.optional() }), run: async (v, a) => privacyOverview(ctx(v), { entityId: await entityId(v, a.entity) }) }),
  tool({ ...read(PRIVACY_READ), name: "list_retention_rules", description: "Every retention rule: data, class, how long it is kept for an entity (statutory minimum or changed by your organisation), what starts the clock and what happens then.",
    input: z.object({ entity: entity.optional() }), run: async (v, a) => look(v, async (tx) => listRules(tx, await entityId(v, a.entity))) }),
  tool({ ...read(PRIVACY_READ), name: "get_retention_rule", description: "One retention rule by its id or label, with its period for an entity.",
    input: z.object({ rule: z.string().min(1).max(200), entity: entity.optional() }),
    run: async (v, a) => {
      const all = await look(v, async (tx) => listRules(tx, await entityId(v, a.entity)));
      const named = (x: { label: string }) => x.label.toLowerCase() === a.rule.trim().toLowerCase();
      return all.rules.find((r) => r.id === a.rule || named(r)) ?? all.defaults.find(named) ?? all.appendOnly.find(named) ?? Promise.reject(notFound(`retention rule "${a.rule}"`));
    } }),
  tool({ ...read(PRIVACY_READ), name: "list_privacy_requests", description: "Access and erasure requests, open ones first, with what is kept and why.", input: z.object({ status: z.enum(["open", "completed"]).optional() }),
    run: async (v, a) => (await look(v, listRequests)).filter((r) => !a.status || r.status === a.status) }),
  tool({ ...read(PRIVACY_READ), name: "get_privacy_request", description: "One access or erasure request: the person's records in every module, what is kept and why, and who opened and approved it.", input: z.object({ id }),
    run: (v, a) => request(v, a.id) }),
  tool({ ...read(PRIVACY_READ), name: "list_legal_holds", description: "Active legal holds: whose records the purge and erasure must keep, and why.", input: z.object({}), run: (v) => look(v, listHolds) }),
  tool({ ...read(PRIVACY_READ), name: "retention_purge_history", description: "What the daily purge removed, by data class and count (never values); label narrows it to one kind of data.",
    input: z.object({ days: z.number().int().min(1).max(365).optional(), label: z.string().max(200).optional() }),
    run: async (v, a) => (await look(v, (tx) => purgedSince(tx, a.days ?? 30))).filter((p) => !a.label || p.label === a.label) }),
  tool({ scope: "sensitive", permission: PRIVACY_MANAGE, readOnly: true, name: "get_access_package", description: "The data package of a completed access request, to send to the person.", input: z.object({ id }),
    run: async (v, a) => (await look(v, (tx) => accessPackage(tx, a.id))) ?? Promise.reject(notFound(`access package ${a.id}`)) }),
  tool({ ...write(PRIVACY_MANAGE), name: "open_privacy_request", description: "Open an access or erasure request for a person. amax lists their records in every module; a second Admin or HR person completes it.",
    input: z.object({ kind: z.enum(["access", "erasure"]), person }), run: async (v, a, s) => (chatOnly(s), openPrivacyRequest(ctxFor(v, s), a)) }),
  tool({ ...write(PRIVACY_MANAGE), name: "complete_privacy_request", destructive: true, description: "Approve and complete an access or erasure request opened by someone else: export the data package, or erase and anonymise. Records the law still requires are kept.",
    input: z.object({ id }), run: async (v, a, s) => (chatOnly(s), completePrivacyRequest(ctxFor(v, s), a)) }),
  tool({ ...write(PRIVACY_MANAGE), name: "place_legal_hold", description: "Pause the purge and erasure for a person, or for a matter given the ids of its records.",
    input: z.discriminatedUnion("kind", [z.object({ kind: z.literal("person"), person, reason }), z.object({ kind: z.literal("matter"), matter: z.string().min(1).max(200), ids: z.array(z.string().min(1).max(200)).min(1).max(20), reason })]),
    run: (v, a, s) => placeLegalHold(ctxFor(v, s), a) }),
  tool({ ...write(PRIVACY_MANAGE), name: "release_legal_hold", description: "Release a legal hold; the purge resumes for those records.", input: z.object({ id: z.uuid() }), run: (v, a, s) => releaseLegalHold(ctxFor(v, s), a) }),
  tool({ ...write(PRIVACY_MANAGE), name: "set_retention_period", description: "Change how long a rule's data is kept, for one entity or all (ISO 8601, e.g. P10Y). Never below a statutory minimum.",
    input: z.object({ rule: z.string().min(1).max(200), entity: entity.optional(), period: z.string().regex(/^P(\d+[YMWD])+$/) }),
    run: async (v, a, s) => setRetentionPeriod(ctxFor(v, s), { rule: a.rule, entityId: await entityId(v, a.entity), period: a.period }) }),
];
