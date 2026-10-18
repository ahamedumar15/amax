import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import type { NotificationRule } from "@amax/core";

export type Category = NotificationRule["category"];
export const CATEGORIES: { id: Category; title: string }[] = [
  { id: "approvals", title: "Approvals" },
  { id: "releases", title: "Releases" },
  { id: "reminders", title: "Reminders" },
];
export const CHANNELS = ["email", "teams"] as const;
export type Channel = (typeof CHANNELS)[number];
export type DeliveryStatus = "pending" | "digest" | "sent" | "failed" | "skipped";

export type PinRef = { label: string; tool: string; args: Record<string, unknown> };
export type InboxItem = {
  id: string; module: string; moduleTitle: string; category: Category; urgent: boolean;
  title: string; body: string | null; href: string | null; pin: PinRef; createdAt: string; read: boolean;
};
export type InboxGroup = { module: string; title: string; items: InboxItem[] };
export type Inbox = { unread: number; groups: InboxGroup[] };
export type Preference = { category: Category; title: string; email: boolean; teams: boolean; digest: boolean };
export type QuietHours = { starts: string; ends: string } | null;
export type Preferences = { categories: Preference[]; quietHours: QuietHours; zone: string; entity: string | null };

/** No row means these: the bell, plus email; Teams and the digest are opt-in. */
export const DEFAULT_PREFERENCE = { email: true, teams: false, digest: false } as const;
/** Digests go out at this local hour in each legal entity's zone. */
export const DIGEST_HOUR = "08:00";

export type DeliveryRecorded = { deliveryId: string; notificationId: string; userId: string; channel: Channel; adapter: string | null; status: DeliveryStatus };
export const EVENTS = {
  created: "notifications.notification.created",
  delivered: "notifications.delivery.recorded",
  preferenceSet: "notifications.preference.set",
  quietHoursSet: "notifications.quiet_hours.set",
  read: "notifications.notification.read",
} as const;

/** The viewer's own unread count. Notifications are only ever their recipient's. */
export async function unreadCount(tx: Tx, viewer: Viewer): Promise<number> {
  const [r] = await tx.execute(sql`select count(*)::int as n from notifications.notification where user_id = ${viewer.userId} and read_at is null`);
  return Number(r?.n ?? 0);
}
