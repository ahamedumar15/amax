// The only import surface for other modules (docs/module-standard.md). Counts only: no excerpt, link
// or address ever leaves this module through the contract.
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";

export const RECORD_TYPES = ["opportunity", "activity", "leave", "ticket"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];
export const SOURCE_KINDS = ["mailbox", "channel"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export const SCAN_STATUSES = ["completed", "failed", "skipped"] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const SCAN_JOB = "inbox-agent.scan";
export const SCAN_CRON = "0 * * * *";
export const SUGGESTION_KIND = "inbox-agent.route";

export const EVENTS = { scanned: "inbox-agent.scan.completed", triaged: "inbox-agent.find.triaged" } as const;
/** Counts only: how many messages a scan read and how it ended. */
export type ScanCompleted = { scanId: string; status: ScanStatus; messages: number };
/** A find the agent read as a record of `recordType` (or none): ids only, never the message. */
export type FindTriaged = { findId: string; recordType: RecordType | null };

export type InboxState = { consented: boolean; mailboxes: number; channels: number; openFinds: number; lastScanAt: string | null; lastStatus: ScanStatus | null };

/** The agent at a glance for another screen (Integrations, Insights): counts, never content. */
export async function inboxState(tx: Tx): Promise<InboxState> {
  const [r] = await tx.execute(sql`select
    exists (select 1 from inbox_agent.consent where granted) as consented,
    (select count(*) from inbox_agent.source where removed_at is null and kind = 'mailbox')::int as mailboxes,
    (select count(*) from inbox_agent.source where removed_at is null and kind = 'channel')::int as channels,
    (select count(*) from inbox_agent.find where status = 'suggested' and expires_at >= now())::int as open_finds,
    (select finished_at from inbox_agent.scan order by finished_at desc limit 1) as last_at,
    (select status from inbox_agent.scan order by finished_at desc limit 1) as last_status`);
  return {
    consented: r.consented === true, mailboxes: Number(r.mailboxes), channels: Number(r.channels), openFinds: Number(r.open_finds),
    lastScanAt: r.last_at ? new Date(r.last_at as string).toISOString() : null, lastStatus: (r.last_status as ScanStatus | null) ?? null,
  };
}
