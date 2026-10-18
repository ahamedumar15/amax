import type { BackupOverview } from "@amax/core/backup";
import { PinnedTicket as Ticket } from "../../../../components/settings/PinnedTicket";
import { Art } from "./Art";
import { duration, lastDrill, plural } from "./format";

const OVERVIEW = { label: "Backups and export", tool: "backups_overview", args: {} };
const pct = (n: number, of: number) => Math.round((n / of) * 100);

export function BackupTickets({ s }: { s: BackupOverview }) {
  const rpo = s.pitr?.rpoMinutes ?? null;
  const drill = lastDrill(s.drills);
  const waiting = s.exports.filter((e) => e.status === "awaiting_approval").length;
  const rtoTarget = `Target ${s.targets.rtoMinutes / 60} h`;
  return (
    <div className="tickets four">
      <Ticket pin={{ ...OVERVIEW, label: "Recovery point" }} tone={rpo === null ? "attention" : rpo <= s.targets.rpoMinutes ? "good" : "problem"} label="Recovery point" value={rpo === null ? "Not set" : `${rpo} min`}
        progress={rpo === null ? undefined : { percent: pct(rpo, s.targets.rpoMinutes), label: `Target ${s.targets.rpoMinutes} min` }} note={rpo === null ? `Target ${s.targets.rpoMinutes} min; set AMAX_PITR_RPO_MINUTES` : undefined} art={<Art name="clock" />} />
      <Ticket pin={{ label: "Restore drills", tool: "list_restore_drills", args: {} }} tone={!drill || drill.status === "failed" ? "problem" : drill.status === "slow" ? "attention" : "good"} label="Last drill restore time"
        value={drill?.durationMs != null ? duration(drill.durationMs) : "None yet"} progress={drill?.durationMs != null ? { percent: pct(drill.durationMs / 60_000, s.targets.rtoMinutes), label: rtoTarget } : undefined} note={drill?.durationMs != null ? undefined : rtoTarget} art={<Art name="rocket" />} />
      <Ticket pin={{ ...OVERVIEW, label: "Restore window" }} tone="info" label="Restore window" value={s.pitr?.windowDays ? `${s.pitr.windowDays} days` : "Snapshots only"}
        note={`Plus ${plural(s.snapshots.monthly, "monthly snapshot")}`} art={<Art name="calendar" />} />
      <Ticket pin={{ label: "Tenant exports", tool: "list_tenant_exports", args: {} }} tone={waiting ? "attention" : "good"} label="Export awaiting approval" value={String(waiting)} note={waiting ? "Needs a second Admin" : "None waiting"} art={<Art name="key" />} />
    </div>
  );
}
