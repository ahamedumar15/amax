import type { ExportView } from "@amax/core/backup";
import { EmptyState, PinButton } from "@amax/ui";
import { AskButton } from "../../../../components/settings/AskButton";
import { exportNote, initials, shortDay } from "./format";

type Props = { exports: ExportView[]; names: Record<string, string> };
const STATE: Record<string, [string, string]> = { building: ["info", "Building"], failed: ["bad", "Failed"], cancelled: ["", "Cancelled"] };

function Action({ e, who }: { e: ExportView; who: string }) {
  const pin = { label: `Tenant export ${shortDay(e.requestedAt)}`, tool: "get_tenant_export", args: { exportId: e.id } };
  if (e.status === "awaiting_approval") return <AskButton primary small label="Ask to approve" prompt={`Approve the tenant export ${who} asked for on ${shortDay(e.requestedAt)}`} pin={pin} tool="approve_tenant_export" name={`Ask to approve the tenant export ${who} asked for`} />;
  if (e.status === "ready" && !e.expired) return <AskButton label="Ask for the link" prompt={`Give me the download link for the tenant export of ${shortDay(e.requestedAt)}`} pin={pin} tool="get_tenant_export_link" name={`Ask for the link to the export of ${shortDay(e.requestedAt)}`} />;
  const [tone, text] = e.status === "ready" ? ["", "Expired"] : STATE[e.status] ?? ["", e.status];
  return <span className={`chip ${tone}`.trim()}>{text}</span>;
}

export function ExportsCard({ exports, names }: Props) {
  const who = (actor: string | null) => (actor ? names[actor] ?? "someone" : "nobody yet");
  const waiting = exports.filter((e) => e.status === "awaiting_approval").length;
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>Exports</h2><PinButton inline pin={{ label: "Tenant exports", tool: "list_tenant_exports", args: {} }} />{waiting > 0 && <span className="chip warn">{waiting} need{waiting === 1 ? "s" : ""} approval</span>}</div>
      {exports.length === 0 ? <EmptyState icon="grid" title="No tenant exports yet" hint="Ask amax to export all your data; a second Admin approves it." /> : (
        <ul className="list">
          {exports.slice(0, 6).map((e, i) => (
            <li key={e.id}>
              <div className="l"><span className={`av sm ${i % 2 ? "a3" : "a4"}`} aria-hidden="true">{initials(who(e.requestedBy))}</span><div>Whole tenant, asked by {who(e.requestedBy)}<small>{exportNote(e, who)}</small></div></div>
              <div className="r"><Action e={e} who={who(e.requestedBy)} /><PinButton inline pin={{ label: `Tenant export ${shortDay(e.requestedAt)}`, tool: "get_tenant_export", args: { exportId: e.id } }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
