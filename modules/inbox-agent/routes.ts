import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { RecordType } from "./contracts";

// 025 AC-2: each record type belongs to one module, and a find is added there through that module's
// own chat intent, never by this module. `table` tells whether the owner is installed; `permission`
// is what adding needs, so a find shows only to people who could add it. Helpdesk (022) isn't built
// yet: its route stays dark until helpdesk.ticket exists.
export type Route = { type: RecordType; module: string; title: string; label: string; table: string; permission: string; intent: string | null; tool: string };

export const ROUTES: Record<RecordType, Route> = {
  opportunity: { type: "opportunity", module: "presales", title: "Presales", label: "New opportunity", table: "presales.opportunity", permission: "presales:opportunity:create", intent: "presales.new-opportunity", tool: "create_opportunity" },
  activity: { type: "activity", module: "presales", title: "Presales", label: "Sales activity", table: "presales.activity", permission: "presales:opportunity:edit", intent: null, tool: "log_opportunity_activity" },
  leave: { type: "leave", module: "leave", title: "Leave", label: "Leave request", table: "leave.request", permission: "leave:request", intent: "leave.request", tool: "request_leave" },
  ticket: { type: "ticket", module: "helpdesk", title: "Helpdesk", label: "Ticket", table: "helpdesk.ticket", permission: "helpdesk:ticket:create", intent: "helpdesk.new-ticket", tool: "create_ticket" },
};

/** The record types whose owning module is installed in this database. */
export async function installedRoutes(tx: Tx): Promise<Route[]> {
  const all = Object.values(ROUTES);
  const [r] = await tx.execute(sql`select ${sql.join(all.map((x, i) => sql`to_regclass(${x.table}) is not null as ${sql.raw(`r${i}`)}`), sql`, `)}`);
  return all.filter((_, i) => r[`r${i}`] === true);
}

/** What "Add" sends: the owner's intent opens in chat with the find pinned (its label names the mode);
 * without an intent, a prompt naming the owner's tool. Either way the owner's tool writes after confirm. */
export const addPrompt = (r: Route, findId: string) => (r.intent ? r.label : `Log a ${r.label.toLowerCase()} with ${r.tool} from the inbox find ${findId}`);
