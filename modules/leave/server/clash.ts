import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { asDay } from "./days";

export type Clash = { projectKey: string; release: string; from: string; to: string };

/** A release stays in flight for this many days after a deployment short of Prod. */
export const WINDOW_DAYS = 14;

export const clashLabel = (c: Pick<Clash, "release">) => `Overlaps ${c.release}`;

/** Releases in flight (from delivery, through its contract's events) that overlap these dates. */
export async function clashesFor(tx: Tx, from: string, to: string): Promise<Clash[]> {
  const rows = await tx.execute(sql`select project_key, project_title, version, environment, retry, starts_on, ends_on from leave.release_window
    where starts_on <= ${to} and ends_on >= ${from} order by starts_on, project_key`);
  return rows.map((r) => ({
    projectKey: r.project_key as string, from: asDay(r.starts_on), to: asDay(r.ends_on),
    release: `${r.project_title} ${r.version} ${r.environment}${r.retry ? " retry" : ""}`,
  }));
}

