import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import { putSecret } from "@amax/core/secrets";
import { setEgress } from "@amax/api/egress";
import { ctxFor } from "../server/context";
import { DIGEST } from "../server/digest";
import { setPreference, setQuietHours } from "../server/prefs";
import { notify } from "../server/notify";
import { quietEnd } from "../server/quiet";
import { notificationsDb, T } from "./db";

const TEAMS = "https://contoso.webhook.office.com/webhookb2/demo";
const job = () => contextFor.job(T, "notifications-test");

describe.skipIf(!hasDb)("030 channels, digest and quiet hours (Postgres)", () => {
  let db: Awaited<ReturnType<typeof notificationsDb>>;
  const wire: { url: string; body: string }[] = [];
  let teamsFails = 1;
  beforeAll(async () => {
    db = await notificationsDb();
    await putSecret(job(), { connector: "msgraph-mail", value: JSON.stringify({ tenant: "contoso-demo", clientId: "c1", clientSecret: "s3cret-value", sender: "amax@contoso.example" }) });
    await putSecret(job(), { connector: "teams", value: TEAMS });
    const answer = (url: URL) => (url.hostname === "login.microsoftonline.com" ? { status: 200, body: JSON.stringify({ access_token: "tok" }) } : { status: 202, body: "" });
    setEgress({
      resolve: async () => [{ address: "1.1.1.1", family: 4 }],
      exchange: async (url, init) => (wire.push({ url: url.href, body: init.body }), answer(url)),
      send: async (url, init) => (wire.push({ url: url.href, body: init.body }), teamsFails-- > 0 ? 500 : 200),
    });
  }, 120_000);
  afterAll(async () => { setEgress({}); await db?.t.drop(); });

  const remind = async (key: string) => db.emit("time.week.reminded", { weekId: "00000000-0000-4000-8000-000000000042", userId: await db.idOf(key), week: "2026-W42", by: `user:${await db.idOf("maya")}` });

  it("AC2 email goes out through Microsoft Graph and Teams through its webhook, both behind one adapter interface, retried on failure", async () => {
    await setPreference(ctxFor(await db.as("kasun")), { category: "reminders", teams: true });
    await remind("kasun");
    await db.drain();
    const mail = wire.find((w) => w.url.includes("/sendMail"))!;
    expect(mail.url).toBe("https://graph.microsoft.com/v1.0/users/amax%40contoso.example/sendMail");
    expect(JSON.parse(mail.body).message).toMatchObject({ subject: "Reminder: submit your timesheet for 2026-W42", toRecipients: [{ emailAddress: { address: "kasun@lumenlabs.test" } }] });
    expect(wire.filter((w) => w.url === TEAMS).map((w) => JSON.parse(w.body).text)).toEqual([expect.stringContaining("**Kasun Dias**"), expect.stringContaining("**Kasun Dias**")]);
    expect(wire.some((w) => w.url.includes("graph") && w.body.includes("s3cret-value"))).toBe(false);
    const sent = await db.q(sql`select channel, adapter, status, attempts from notifications.delivery where user_id = ${await db.idOf("kasun")} order by channel`);
    expect(sent).toEqual([{ channel: "email", adapter: "graph", status: "sent", attempts: 1 }, { channel: "teams", adapter: "webhook", status: "sent", attempts: 2 }]);
  }, 120_000);

  it("AC3 a digest category waits for the 08:00 digest, and quiet hours in the entity's zone hold every message until they end", async () => {
    const colombo = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
    const now = new Date();
    expect(quietEnd(new Date("2026-10-16T16:00:00Z"), "Asia/Colombo", "21:00", "07:00")).toEqual(new Date("2026-10-17T01:30:00Z"));
    expect(quietEnd(new Date("2026-10-16T06:00:00Z"), "Asia/Colombo", "21:00", "07:00")).toBeNull();
    const nimal = await db.as("nimal");
    await setPreference(ctxFor(nimal), { category: "reminders", digest: true });
    await setQuietHours(ctxFor(nimal), { starts: colombo(new Date(now.getTime() - 3_600_000)), ends: colombo(new Date(now.getTime() + 7_200_000)) });
    await remind("nimal");
    await db.drain();
    const [d] = await db.q(sql`select status from notifications.delivery where user_id = ${nimal.userId}`);
    expect(d.status).toBe("digest");
    await setPreference(ctxFor(nimal), { category: "approvals", digest: true });
    await db.emit("time.week.approved", { weekId: "00000000-0000-4000-8000-000000000043", userId: nimal.userId, week: "2026-W42", by: "user:someone", chain: "manager", comment: null });
    await db.drain();
    await notify(job(), { eventId: "00000000-0000-4000-8000-000000000044", ruleId: "test.urgent", module: "delivery", moduleTitle: "Projects", urgent: true, category: "approvals",
      messages: [{ userId: nimal.userId, title: "Pay run blocked", body: null, href: null }] });
    const [urgent] = await db.q(sql`select d.status, d.not_before from notifications.delivery d join notifications.notification n on n.id = d.notification_id where n.rule_id = 'test.urgent'`);
    expect(urgent.status).toBe("pending");
    expect(Math.abs(new Date(urgent.not_before as string).getTime() - (now.getTime() + 7_200_000))).toBeLessThan(120_000);
    await db.engine.tick();
    const [run] = await db.t.owner`select id, status from workflows.run where workflow = 'notifications.deliver' and status <> 'completed'`;
    expect(run.status).toBe("sleeping");
    await db.t.owner`update workflows.run set status = 'cancelled' where id = ${run.id}`;
    await db.engine.start(T, DIGEST, { at: "2026-10-19T03:00:00Z" }, { startedBy: "test" });
    await db.drain();
    expect(wire.filter((w) => w.body.includes("Nimal"))).toEqual([]);
    await db.engine.start(T, DIGEST, { at: "2026-10-19T02:40:00Z" }, { startedBy: "test" });
    await db.drain();
    const digest = wire.filter((w) => w.url.includes("/sendMail") && w.body.includes("Nimal")).map((w) => JSON.parse(w.body).message.subject);
    expect(digest).toEqual(["Your amax digest: 2 notifications"]);
  }, 120_000);
});
