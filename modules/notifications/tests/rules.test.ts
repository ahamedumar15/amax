import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createRegistry } from "@amax/mcp";
import { installedModules } from "./installed";
import { notificationsDb } from "./db";

describe.skipIf(!hasDb)("030 rules and delivery (Postgres)", () => {
  let db: Awaited<ReturnType<typeof notificationsDb>>;
  let registry: ReturnType<typeof createRegistry>;
  beforeAll(async () => {
    db = await notificationsDb();
    registry = createRegistry(await installedModules());
  }, 120_000);
  afterAll(() => db?.t.drop());

  const titles = (rule: string) => db.q(sql`select u.email, n.title, n.href from notifications.notification n join auth.user u on u.id = n.user_id where n.rule_id = ${rule} order by u.email`);

  it("AC1 time's manifest rules turn its events into notifications: the approver chain for a submission, the person for the decision, never whoever acted", async () => {
    const [tharushi, maya] = await Promise.all([db.as("tharushi"), db.as("maya")]);
    await registry.call(tharushi, "submit_week", { week: "2026-W42" }, { source: "mcp" });
    await db.drain();
    expect((await titles("time.week-submitted")).filter((r) => r.title.includes("Tharushi"))).toEqual([
      { email: "maya@lumenlabs.test", title: "Tharushi Wijesinghe submitted 2026-W42", href: "/time/w/2026-W42" },
    ]);
    await registry.call(maya, "approve_week", { person: "tharushi@lumenlabs.test", week: "2026-W42" }, { source: "mcp" });
    await db.drain();
    expect(await titles("time.week-approved")).toEqual(expect.arrayContaining([
      { email: "tharushi@lumenlabs.test", title: "Your timesheet for 2026-W42 was approved", href: "/time/my/2026-W42" },
    ]));
    expect((await titles("time.week-approved")).some((r) => r.email === "maya@lumenlabs.test" && r.title.includes("2026-W42"))).toBe(false);
  }, 120_000);

  it("AC5 a redelivered event makes no second notification; each channel is one audited run, recorded skipped while it has no credential", async () => {
    const [event] = await db.q(sql`select event_id from notifications.notification where rule_id = 'time.week-submitted' and title like 'Tharushi%'`);
    await db.t.owner`delete from core.processed_event where event_id = ${event.event_id}`;
    await db.t.owner`update core.event set delivered_at = null where id = ${event.event_id}`;
    await db.drain();
    const [{ n }] = await db.q(sql`select count(*)::int as n from notifications.notification where event_id = ${event.event_id}`);
    expect(n).toBe(1);
    const deliveries = await db.q(sql`select d.channel, d.status from notifications.delivery d join notifications.notification n on n.id = d.notification_id
      where n.event_id = ${event.event_id} order by d.channel`);
    expect(deliveries).toEqual([{ channel: "email", status: "skipped" }, { channel: "teams", status: "skipped" }]);
    const runs = await db.t.owner`select status from workflows.run where workflow = 'notifications.deliver'`;
    expect(runs.length).toBeGreaterThanOrEqual(2);
    const audit = await db.q(sql`select after from core.audit_event where action = 'notifications.delivery.record' order by seq`);
    expect(audit.map((a) => (a.after as { channel: string; status: string }).channel).sort()).toEqual(expect.arrayContaining(["email", "teams"]));
    const [created] = await db.q(sql`select after from core.audit_event where action = 'notifications.notification.create' order by seq limit 1`);
    expect(created.after).toMatchObject({ channel: "in_app", ruleId: "time.week-submitted" });
  }, 120_000);
});
