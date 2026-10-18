import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import type { Tx } from "@amax/db";

// Demo data (fictional, fixtures.md): Maya's bell and settings, as in the 030 mock section.
const userId = async (tx: Tx, key: string) => (await tx.execute(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`))[0]?.id as string | undefined;

const PREFS = [
  { category: "approvals", email: true, teams: true, digest: false },
  { category: "releases", email: false, teams: true, digest: true },
  { category: "reminders", email: true, teams: false, digest: true },
];

const ITEMS = [
  { event: "30303030-0000-4000-8000-000000000001", rule: "delivery.release-rolled-back", module: "delivery", title: "Projects", category: "releases", urgency: "urgent",
    text: "Release v1.8.0 rolled back in UAT", body: "Fleet Tracker", href: "/delivery/releases/FLT/v1.8.0", at: "2026-10-14T11:05:00Z" },
  { event: "30303030-0000-4000-8000-000000000002", rule: "time.week-submitted", module: "time", title: "Time", category: "approvals", urgency: "normal",
    text: "Kasun Dias submitted 2026-W42", body: "32.5 h to approve", href: "/time/w/2026-W42", at: "2026-10-15T17:31:00Z" },
  { event: "30303030-0000-4000-8000-000000000003", rule: "time.week-approved", module: "time", title: "Time", category: "approvals", urgency: "normal",
    text: "Your timesheet for 2026-W41 was approved", body: null, href: "/time/my/2026-W41", at: "2026-10-12T09:15:00Z", read: true },
];

export const notificationFixtures: FixtureSeed = async ({ tx, tenantId }) => {
  const maya = await userId(tx, "maya");
  if (!maya) return;
  for (const p of PREFS) {
    await tx.execute(sql`insert into notifications.preference (tenant_id, user_id, category, email, teams, digest) values (${tenantId}, ${maya}, ${p.category}, ${p.email}, ${p.teams}, ${p.digest}) on conflict do nothing`);
  }
  await tx.execute(sql`insert into notifications.quiet_hours (tenant_id, user_id, starts, ends) values (${tenantId}, ${maya}, '21:00', '07:00') on conflict do nothing`);
  for (const n of ITEMS) {
    await tx.execute(sql`insert into notifications.notification (tenant_id, user_id, event_id, rule_id, module, module_title, category, urgency, title, body, href, created_at, read_at)
      values (${tenantId}, ${maya}, ${n.event}, ${n.rule}, ${n.module}, ${n.title}, ${n.category}, ${n.urgency}, ${n.text}, ${n.body}, ${n.href}, ${n.at}, ${"read" in n ? n.at : null})
      on conflict do nothing`);
  }
};
