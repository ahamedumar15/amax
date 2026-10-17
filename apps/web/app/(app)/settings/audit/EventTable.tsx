import type { AuditEntry } from "@amax/core/server";
import { PinButton } from "@amax/ui";
import { byLine, shortTrace, time, who, type Names } from "./format";

const label = (e: AuditEntry) => (e.chain === "audit" ? e.what : e.tool ? `${e.what} ${e.tool}` : e.what);

export function EventTable({ rows, names, traceHref }: { rows: AuditEntry[]; names: Names; traceHref: (id: string) => string }) {
  return (
    <div className="scroll-x"><table className="tbl">
      <caption className="sr">Audited writes and trace steps, newest first</caption>
      <thead><tr><th>When (UTC)</th><th>Who</th><th>What</th><th>Record</th><th>Trace</th><th className="num"><span className="sr">Pin</span></th></tr></thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={6} className="muted">No events match these filters.</td></tr>}
        {rows.map((e) => {
          const by = byLine(e, names);
          return (
            <tr key={`${e.chain}-${e.seq}`} className="pinnable">
              <td data-label="When"><time dateTime={e.at}>{e.at.slice(0, 10)} {time(e.at)}</time></td>
              <td data-label="Who">{who(e.actor, names)}{by && <small>{by}</small>}</td>
              <td data-label="What"><code>{label(e)}</code><small>{e.chain === "audit" ? "Audited write" : "Trace step"} #{e.seq}</small></td>
              <td data-label="Record">{e.record ?? "–"}</td>
              <td data-label="Trace">{e.traceId ? <a className="audit-trace" href={traceHref(e.traceId)} aria-label={`Open trace ${e.traceId}`}>{shortTrace(e.traceId)}</a> : "–"}</td>
              <td className="num"><PinButton pin={{ label: `${e.chain === "audit" ? "Audit" : "Trace"} event ${e.seq}`, tool: "search_audit", args: { chain: e.chain, seq: e.seq } }} /></td>
            </tr>
          );
        })}
      </tbody>
    </table></div>
  );
}
