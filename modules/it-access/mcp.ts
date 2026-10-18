import { z } from "zod";
import type { McpToolDef, SearchHit } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { createSuggestion } from "@amax/agents/server";
import { WRITE_SCOPES } from "./contracts";
import { accountOf, productOf } from "./pins";
import { setWriteConsent } from "./server/consent";
import { getAccount, getProduct, syncStatus } from "./server/queries";
import { CONSENT, ctxFor, READ, REQUEST, REVIEW } from "./server/read";
import { requestFor } from "./server/requests";
import { extendAccess, recordReview } from "./server/reviews";
import { FILTERS, filterOf } from "./server/filters";
import { accessView } from "./server/view";

// MCP tools (004): the same queries and services as the screen, so permissions and audit match. Reads
// leave out money for anyone without the 055 pricing class (IT Admin). Grants, revokes and seat
// removals are never direct writes: they become 006 suggestions that someone else in IT approves.
type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: READ };
const write = (permission: string) => ({ scope: "write" as const, permission });
const accountId = z.uuid().describe("The account's id, from list_access or get_account");
const productId = z.uuid().describe("The product's id, from list_access");
const people = z.enum(FILTERS.map((f) => f.id) as [string, ...string[]]).optional().describe("everyone (default), admins, leavers or contractors");

export const mcpTools: McpToolDef[] = [
  tool({ ...read, pin: "view", name: "list_access", description: "Access and licences: every product's seats, use in 30 days and unused seats (spend for Admin), the licence agent's savings, Intune devices, leavers who still have access, and people with their Entra groups, licences, devices and admin roles.",
    input: z.object({ people }), run: (v, a) => accessView(v, filterOf(a.people)) }),
  tool({ ...read, pin: { id: "productId", of: productOf as never }, name: "get_product", description: "One licensed product: seats, assigned, active in 30 days, and the seats unused for 60+ days with who holds them.",
    input: z.object({ productId }), run: (v, a) => getProduct(v, a.productId) }),
  tool({ ...read, pin: { id: "accountId", of: accountOf as never }, name: "get_account", description: "One person's or contractor's access: Entra groups, admin roles, licence seats, devices, last review, and the access changes IT approved.",
    input: z.object({ accountId }), run: (v, a) => getAccount(v, a.accountId) }),
  tool({ ...read, name: "get_access_sync", description: "The sync runs (Microsoft Graph, Azure DevOps, GitHub; read-only credentials) and whether the write registration is consented, with its scopes.",
    input: z.object({}), run: (v) => syncStatus(v) }),
  tool({ ...write(REQUEST), name: "request_access_change", description: "Ask IT to grant a licence, revoke all of someone's access (on a last day), or remove seats of a product. It becomes a suggestion that someone else in IT approves; nothing changes until then.",
    input: z.object({ action: z.enum(["grant", "revoke", "remove-seats"]), accountId: accountId.optional(), productId: productId.optional(), lastDay: z.iso.date().optional(), seatIds: z.array(z.uuid()).max(200).optional() }),
    service: createSuggestion, run: async (v, a, s = "mcp") => createSuggestion(ctxFor(v, s), await requestFor(v, a)) }),
  tool({ ...write(REVIEW), name: "record_access_review", description: "Record that you reviewed someone's access and kept it as it is. To change access, use request_access_change.",
    input: z.object({ accountId }), service: recordReview, run: (v, a, s = "mcp") => recordReview(ctxFor(v, s), a) }),
  tool({ ...write(REVIEW), name: "extend_access", description: "Extend a contractor's access to a new last day, up to a year ahead.",
    input: z.object({ accountId, until: z.iso.date() }), service: extendAccess, run: (v, a, s = "mcp") => extendAccess(ctxFor(v, s), a) }),
  tool({ ...write(CONSENT), name: "set_access_write_consent", description: "Admin only: turn the Microsoft Graph write registration on for this tenant with named scopes, or off. Off by default; approved changes are left to IT by hand while it is off.",
    input: z.object({ enabled: z.boolean(), scopes: z.array(z.enum(WRITE_SCOPES)).default([]) }), service: setWriteConsent, run: (v, a, s = "mcp") => setWriteConsent(ctxFor(v, s), a) }),
];

export async function search(viewer: Viewer, query: string): Promise<SearchHit[]> {
  if (!/licen[cs]e|seat|access|device|intune|entra/i.test(query)) return [];
  const p = await accessView(viewer).catch(() => null);
  return (p?.products ?? []).map((x) => ({ type: "licence", id: x.id, title: `${x.name} (${x.assigned} of ${x.seats} seats)`, url: "/it-access", summary: `${x.idle} unused` })).slice(0, 10);
}
