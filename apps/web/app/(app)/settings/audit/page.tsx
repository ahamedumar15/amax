import { notFound } from "next/navigation";
import { z } from "zod";
import { can } from "@amax/auth";
import { AUDIT_READ, auditView } from "@amax/mcp/audit-tools";
import { PinButton } from "@amax/ui";
import { getDb } from "../../../../lib/server";
import { getViewer } from "../../../../lib/viewer";
import { AuditTickets } from "./AuditTickets";
import { EventTable } from "./EventTable";
import { TraceTimeline } from "./TraceTimeline";
import "../settings.css";
import "./audit.css";

export const metadata = { title: "Audit and trace" };
export const dynamic = "force-dynamic";

const Search = z.object({
  q: z.string().max(200).optional().catch(undefined),
  chain: z.enum(["audit", "trace"]).optional().catch(undefined),
  days: z.enum(["1", "7", "30", "all"]).optional().catch(undefined),
  trace: z.uuid().optional().catch(undefined),
  verify: z.string().optional().catch(undefined),
});

const DAYS = [["1", "Today"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["all", "All time"]] as const;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const viewer = await getViewer();
  if (!viewer || !getDb() || !can(viewer, AUDIT_READ)) notFound();
  const q = Search.parse(Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const days = q.days ?? "7";
  const filter = { query: q.q || undefined, chain: q.chain, sinceDays: days === "all" ? undefined : Number(days), limit: 100 };
  const { status, events, trace, names } = await auditView(viewer, { verify: q.verify !== undefined, filter, traceId: q.trace });
  const keep = new URLSearchParams(Object.entries({ q: q.q, chain: q.chain, days: q.days }).filter((e): e is [string, string] => !!e[1]));
  // The Events card pins the same search it shows, so the pin resolves to these rows (052 review).
  const eventsPin = { label: "Audit events", tool: "search_audit", args: Object.fromEntries(Object.entries({ query: filter.query, chain: filter.chain, sinceDays: filter.sinceDays, limit: filter.limit }).filter((e) => e[1] !== undefined)) };
  const traceHref = (id: string) => `?${new URLSearchParams([...keep, ["trace", id]])}#trace-h`;
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><span>Settings</span><span>/</span>Audit and trace</nav>
      <div className="row head">
        <div>
          <h1>Audit and trace</h1>
          <p className="lede">Every change, every AI call and every tool call, chained so that nothing can be edited or removed unnoticed. Read only, by design.</p>
        </div>
        <div className="actions"><a className="btn" href={`?${new URLSearchParams([...keep, ["verify", "1"]])}`}>Verify now</a></div>
      </div>
      {(!status.audit.ok || !status.trace.ok) && <div className="viewbanner" role="alert">A chain no longer verifies. Rows were changed or removed outside amax; compare with the write-once export.</div>}
      <AuditTickets s={status} />
      <section className="card flush pinnable" aria-labelledby="events-h" style={{ marginTop: 28 }}>
        <div className="card-head">
          <h2 id="events-h">Events</h2><PinButton inline pin={eventsPin} />
          <form method="get" className="audit-filter" role="search" aria-label="Filter events">
            <input className="select" type="search" name="q" defaultValue={q.q ?? ""} placeholder="Person, agent, tool or record" aria-label="Person, agent, tool or record" />
            <select className="select" name="chain" defaultValue={q.chain ?? ""} aria-label="Kind"><option value="">Writes and steps</option><option value="audit">Audited writes</option><option value="trace">Trace steps</option></select>
            <select className="select" name="days" defaultValue={days} aria-label="Date">{DAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <button className="btn sm" type="submit">Filter</button>
          </form>
        </div>
        <EventTable rows={events} names={names} traceHref={traceHref} />
      </section>
      {q.trace && trace && <TraceTimeline traceId={q.trace} steps={trace} intact={[status.audit, status.trace]} names={names} />}
    </>
  );
}
