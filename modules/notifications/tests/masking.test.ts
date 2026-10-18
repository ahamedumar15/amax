import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { ModuleManifest } from "@amax/core";
import { HIDDEN } from "../server/render";
import { notificationsDb } from "./db";

// A stand-in for payroll (014): its payslip event carries a pay value, declared as such.
const payroll = {
  id: "payroll-test", title: "Payroll", icon: "cash", group: "People", routes: [],
  events: { emits: ["payroll-test.payslip.ready"], payloads: { "payroll-test.payslip.ready": { userId: "plain", period: "plain", net: "pay" } } },
  notifications: [{ id: "payroll-test.payslip", event: "payroll-test.payslip.ready", category: "reminders", subject: "userId",
    to: [{ owner: "userId" }, { role: "Admin" }, { role: "Engineer" }], title: "Payslip for {period}: {net}", body: "Net pay {net}, {bank}" }],
} as unknown as ModuleManifest;

describe.skipIf(!hasDb)("030 AC-4 recipients and masking (Postgres)", () => {
  let db: Awaited<ReturnType<typeof notificationsDb>>;
  beforeAll(async () => { db = await notificationsDb([payroll]); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC4 a notification carries a pay value only to those who may see it, in the bell and in every message sent", async () => {
    const kasun = await db.idOf("kasun");
    await db.emit("payroll-test.payslip.ready", { userId: kasun, period: "October 2026", net: "LKR 412,500", bank: "000-1234" });
    await db.drain();
    const rows = await db.q(sql`select u.email, n.title, n.body, (select count(*)::int from notifications.delivery d where d.notification_id = n.id) as deliveries
      from notifications.notification n join auth.user u on u.id = n.user_id where n.rule_id = 'payroll-test.payslip' order by u.email`);
    const by = new Map(rows.map((r) => [r.email as string, r]));
    expect(by.get("kasun@lumenlabs.test")).toMatchObject({ title: "Payslip for October 2026: LKR 412,500", body: `Net pay LKR 412,500, ${HIDDEN}` });
    expect(by.get("maya@lumenlabs.test")).toMatchObject({ title: "Payslip for October 2026: LKR 412,500" });
    expect(by.get("nimal@lumenlabs.test")).toMatchObject({ title: `Payslip for October 2026: ${HIDDEN}`, body: `Net pay ${HIDDEN}, ${HIDDEN}` });
    expect(rows.filter((r) => !/kasun|maya|sahan/.test(r.email as string)).every((r) => !String(r.title).includes("412,500") && !String(r.body).includes("412,500"))).toBe(true);
    expect(by.get("nimal@lumenlabs.test")!.deliveries).toBeGreaterThan(0);
    const queued = await db.q(sql`select count(*)::int as n from core.event where name = 'notifications.notification.created' and payload::text like '%412,500%'`);
    expect(queued[0].n).toBe(0);
  }, 120_000);
});
