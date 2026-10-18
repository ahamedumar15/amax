import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { canEver, contextForViewer, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime, type ServiceContext, type Source } from "@amax/core/server";
import { asDay } from "./days";

export const TARGET_DEFAULT = 80;

export const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!canEver(viewer, "reports:read")) throw new ForbiddenError("reports:read", "reports");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

export const ctxFor = (viewer: Viewer, source: Source = "ui"): ServiceContext => contextForViewer(viewer, source);

export const installed = async (tx: Tx, table: string) => Boolean((await tx.execute(sql`select to_regclass(${table}) is not null as on`))[0]?.on);

/** The tenant's target and "today": its pinned day (the demo's Oct 16), else the real date (UTC). */
export async function settingsOf(tx: Tx): Promise<{ target: number; today: string }> {
  const [s] = await tx.execute(sql`select target, today from reports.settings`);
  return { target: Number(s?.target ?? TARGET_DEFAULT), today: s?.today ? asDay(s.today) : new Date().toISOString().slice(0, 10) };
}
