import { z } from "zod";
import type { McpToolDef } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { CATEGORIES, type InboxItem } from "./contracts";
import { ctxFor, MANAGE, READ } from "./server/context";
import { markRead, setPreference, setQuietHours } from "./server/prefs";
import { inbox, notification, preferences } from "./server/read";

type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: READ };
const write = { scope: "write" as const, permission: MANAGE };
const category = z.enum(CATEGORIES.map((c) => c.id) as [string, ...string[]]).describe(`One of ${CATEGORIES.map((c) => c.id).join(", ")}`);
const clock = z.string().describe("24-hour HH:MM, in your legal entity's time zone");

// A bell item is pinned by its id (059); its label is its title.
const notificationOf = (r: InboxItem | null) => (r ? { id: r.id, label: r.title, createdAt: r.createdAt } : null);

export const mcpTools: McpToolDef[] = [
  tool({ ...read, pin: "view", name: "get_notifications", description: "Your notifications: the latest 20, unread first, grouped by module, each with a link to its record.", input: z.object({}),
    run: (v) => inbox(v) }),
  tool({ ...read, pin: { id: "id", of: notificationOf }, name: "get_notification", description: "One of your notifications by id (an item in the bell).", input: z.object({ id: z.uuid() }),
    run: (v, a) => notification(v, a.id) }),
  tool({ ...read, pin: "view", name: "get_notification_preferences", description: "Your notification channels per category (email, Teams, daily digest) and your quiet hours, or one category's row.",
    input: z.object({ category: category.optional() }),
    run: async (v, a) => {
      const p = await preferences(v);
      return a.category ? p.categories.find((c) => c.category === a.category) ?? null : p;
    } }),
  tool({ ...write, name: "set_notification_preference", description: "Turn email or Teams on or off for a category, or switch it to a daily digest at 08:00. Urgent items always skip the digest. The bell always shows new items.",
    input: z.object({ category, email: z.boolean().optional(), teams: z.boolean().optional(), digest: z.boolean().optional() }),
    service: setPreference, run: (v, a, s = "mcp") => setPreference(ctxFor(v, s), a) }),
  tool({ ...write, name: "set_quiet_hours", description: "Set your quiet hours (email and Teams wait until they end, urgent items too), or turn them off with off: true.",
    input: z.object({ starts: clock.optional(), ends: clock.optional(), off: z.boolean().optional() }),
    service: setQuietHours, run: (v, a, s = "mcp") => setQuietHours(ctxFor(v, s), a.off ? { off: true } : { starts: a.starts, ends: a.ends }) }),
  tool({ ...write, name: "mark_notifications_read", description: "Mark your notifications read: the ids given, or all of them with all: true.",
    input: z.object({ ids: z.array(z.uuid()).optional(), all: z.boolean().optional() }),
    service: markRead, run: (v, a, s = "mcp") => markRead(ctxFor(v, s), a.all ? { all: true } : { ids: a.ids ?? [] }) }),
];
