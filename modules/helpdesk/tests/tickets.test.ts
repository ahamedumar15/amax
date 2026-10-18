import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import manifest from "../module";
import { sharedDb } from "./db";

type View = { queues: { key: string }[]; tickets: { number: string; sla: unknown }[]; slas: { queue: string; priority: string; responseMinutes: number; resolutionMinutes: number }[]; stats: Record<string, unknown> };

describe.skipIf(!hasDb)("tickets, queues and SLAs (Postgres)", () => {
  const use = sharedDb();
  const call = async (key: string, tool: string, args: object, role?: "HR" | "ITAdmin") => use().registry.call(await use().as(key, role), tool, args, { source: "mcp" });

  it("AC1 tickets come from chat, Teams and email with their channel and a safe source link, and each queue has separate response and resolution targets per priority", async () => {
    const teams = (await call("kasun", "create_ticket", { title: "Monitor flickers", channel: "teams", sourceLink: "https://teams.microsoft.com/l/message/demo" })) as { id: string; number: string };
    const mail = (await call("kasun", "create_ticket", { title: "<b>Mouse</b> broken", description: "<script>x()</script>Left click <i>sticks</i>", channel: "email", sourceLink: "javascript:alert(1)" })) as { id: string };
    expect(teams.number).toBe("INC-20432");
    expect(await call("kasun", "get_ticket", { ticketId: teams.id })).toMatchObject({ channel: "teams", sourceLink: "https://teams.microsoft.com/l/message/demo", signedIn: true, requester: "Kasun Dias" });
    expect(await call("kasun", "get_ticket", { ticketId: mail.id })).toMatchObject({ channel: "email", sourceLink: null, signedIn: false, title: "Mouse broken", body: "Left click sticks" });
    await expect(call("kasun", "create_ticket", { title: "For Nimal", requesterUserId: (await use().as("nimal")).userId })).rejects.toThrow(/only for yourself/);
    await expect(call("nimal", "set_queue_sla", { queue: "it", priority: "high", responseMinutes: 20, resolutionMinutes: 300 })).rejects.toThrow();
    await call("ravi", "set_queue_sla", { queue: "it", priority: "high", responseMinutes: 20, resolutionMinutes: 300 });
    const v = (await call("ravi", "get_helpdesk", {})) as View;
    expect(v.slas.filter((s) => s.queue === "it").map((s) => [s.priority, s.responseMinutes, s.resolutionMinutes])).toEqual([["urgent", 10, 120], ["high", 20, 300], ["normal", 30, 4320], ["low", 240, 7200]]);
    expect(v.tickets.find((t) => t.number === "INC-20431")?.sla).toMatchObject({ stage: "resolution", leftMinutes: 105, near: false, breached: false });
    expect((await use().q(sql`select count(*)::int as n from core.audit_event where action = 'helpdesk.sla.set'`))[0].n).toBe(1);
  });

  it("AC2 HR tickets and the HR queue are visible only to HR and Admin", async () => {
    const [hr] = await use().q(sql`select id from helpdesk.ticket where number = 'HR-1186'`);
    const admin = (await call("maya", "get_helpdesk", { queue: "hr" })) as View;
    expect([admin.queues.map((q) => q.key), admin.tickets[0].number]).toEqual([["it", "hr", "facilities"], "HR-1186"]);
    const it = (await call("ravi", "get_helpdesk", { queue: "hr" })) as View;
    expect([it.queues.map((q) => q.key), it.tickets.some((t) => t.number.startsWith("HR-")), it.stats.open]).toEqual([["it", "facilities"], false, 22]);
    expect(await call("ravi", "get_ticket", { ticketId: hr.id })).toBeNull();
    expect(((await call("sahan", "get_helpdesk", {}, "HR")) as View).queues.map((q) => q.key)).toEqual(["hr"]);
    expect(await call("sahan", "get_ticket", { ticketId: hr.id }, "HR")).toMatchObject({ number: "HR-1186", handler: { kind: "agent" } });
    await expect(call("nimal", "get_helpdesk", {})).rejects.toThrow();
  });

  it("AC3 the chat intent helpdesk.new-ticket fills create_ticket", () => {
    expect(manifest.chatIntents).toContainEqual(expect.objectContaining({ id: "helpdesk.new-ticket", label: "New ticket", tool: "create_ticket", required: ["title"] }));
    expect(manifest.mcpTools!.find((t) => t.name === "create_ticket")).toMatchObject({ scope: "write", permission: "helpdesk:ticket:create" });
  });
});
