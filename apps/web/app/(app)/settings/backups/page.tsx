import { notFound } from "next/navigation";
import { can } from "@amax/auth";
import { BACKUP_READ, backupOverview } from "@amax/core/backup";
import { PinButton } from "@amax/ui";
import { AskButton } from "../../../../components/settings/AskButton";
import { ctxFor } from "../../../../lib/admin/tool";
import { getDb } from "../../../../lib/server";
import { getViewer } from "../../../../lib/viewer";
import { Sprite } from "./Art";
import { BackupTickets } from "./BackupTickets";
import { DrillTable } from "./DrillTable";
import { ExportsCard } from "./ExportsCard";
import { lede, shortDay } from "./format";
import "../settings.css";
import "../retention/retention.css";
import "./backups.css";

export const metadata = { title: "Backups and export" };
export const dynamic = "force-dynamic";

const OVERVIEW = { label: "Backups and export", tool: "backups_overview", args: {} };
const DRILLS = { label: "Restore drills", tool: "list_restore_drills", args: {} };

// 034 AC-6: Admin only. Every change (a drill now, an export, its approval, offboarding) happens in chat.
export default async function BackupsPage() {
  const viewer = await getViewer();
  if (!viewer || !getDb() || !can(viewer, BACKUP_READ)) notFound();
  const s = await backupOverview(ctxFor(viewer, "ui"));
  return (
    <div className="backups">
      <Sprite />
      <nav className="crumb" aria-label="Breadcrumb"><a href="/settings">Settings</a><span>/</span>Backups and export</nav>
      <div className="row head">
        <div><h1>Backups and export</h1><p className="lede">{lede(s)}</p></div>
        <div className="actions">
          <AskButton label="Run drill now" prompt="Run a restore drill now" pin={DRILLS} tool="request_restore_drill" name="Ask amax to run a restore drill now" />
          <AskButton primary label="Export all data" prompt="Export all our data. Reason: " pin={OVERVIEW} tool="request_tenant_export" name="Ask amax to export all data" />
        </div>
      </div>
      {s.offboarding && (
        <div className="viewbanner" role="status">
          This organisation is leaving amax. On {shortDay(s.offboarding.destroyAfter)} its data key is destroyed and its backups can no longer be read.{" "}
          <AskButton label="Ask to cancel" prompt="Cancel the offboarding" pin={OVERVIEW} tool="cancel_tenant_offboarding" name="Ask amax to cancel the offboarding" />
        </div>
      )}
      <BackupTickets s={s} />
      <div className="card flush pinnable">
        <div className="card-head"><h2>Restore drills</h2><PinButton inline pin={DRILLS} /><span className="muted" style={{ fontSize: 13 }}>Every Sunday, into a scratch database</span></div>
        <DrillTable drills={s.drills} />
      </div>
      <ExportsCard exports={s.exports} names={s.names} />
    </div>
  );
}
