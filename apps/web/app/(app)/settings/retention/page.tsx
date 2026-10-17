import { notFound } from "next/navigation";
import { z } from "zod";
import { can } from "@amax/auth";
import { PRIVACY_READ, privacyOverview } from "@amax/core/privacy";
import { PinButton } from "@amax/ui";
import { AskButton } from "../../../../components/settings/AskButton";
import { getDb } from "../../../../lib/server";
import { getViewer } from "../../../../lib/viewer";
import { ctxFor } from "../../../../lib/admin/tool";
import { country, plural } from "./format";
import { PurgedCard } from "./PurgedCard";
import { RequestsCard } from "./RequestsCard";
import { RetentionTable } from "./RetentionTable";
import { RetentionTickets } from "./RetentionTickets";
import "../settings.css";
import "./retention.css";

export const metadata = { title: "Data retention" };
export const dynamic = "force-dynamic";

const Search = z.object({ entity: z.uuid().optional().catch(undefined) });
const OVERVIEW = { label: "Data retention", tool: "retention_overview", args: {} };

export default async function RetentionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const viewer = await getViewer();
  if (!viewer || !getDb() || !can(viewer, PRIVACY_READ)) notFound();
  const q = Search.parse(Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const s = await privacyOverview(ctxFor(viewer, "ui"), { entityId: q.entity });
  const open = s.requests.filter((r) => r.status === "open");
  const waiting = open.filter((r) => r.kind === "erasure").length;
  const lede = `Tonight's purge removes ${plural(s.due.delete, "record")} and anonymises ${plural(s.due.anonymise, "record")}. ${waiting ? `${waiting === 1 ? "One erasure request is" : `${waiting} erasure requests are`} waiting for a second approver.` : "No erasure request is waiting."}`;
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><a href="/settings">Settings</a><span>/</span>Data retention</nav>
      <div className="row head">
        <div><h1>Data retention</h1><p className="lede">{lede} Changes happen in chat. Pin anything, then ask.</p></div>
        <div className="actions">
          <AskButton label="Ask to add a legal hold" prompt="Place a legal hold on " pin={{ label: "Legal holds", tool: "list_legal_holds", args: {} }} tool="place_legal_hold" />
          <AskButton primary label="Ask for a new request" prompt="Open an erasure request for " pin={OVERVIEW} tool="open_privacy_request" />
        </div>
      </div>
      <RetentionTickets rules={s.rules.length} due={s.due} open={{ access: open.filter((r) => r.kind === "access").length, erasure: open.filter((r) => r.kind === "erasure").length }} holds={s.holds.length} pausedRules={s.rules.filter((r) => r.paused).length} />
      <div className="cols">
        <div className="card flush pinnable">
          <div className="card-head">
            <h2>Retention by data class</h2><PinButton inline pin={{ label: "Retention by data class", tool: "list_retention_rules", args: s.entity ? { entity: s.entity.id } : {} }} />
            <form method="get" className="retention-entity" role="search" aria-label="Choose a legal entity">
              <select className="select" name="entity" defaultValue={s.entity?.id} aria-label="Legal entity">{s.entities.map((e) => <option key={e.id} value={e.id}>{e.name}, {country(e.country)}</option>)}</select>
              <button className="btn sm" type="submit">Show</button>
            </form>
          </div>
          <RetentionTable rules={s.rules} entity={s.entity} entities={s.entities} defaults={s.defaults} appendOnly={s.appendOnly} />
        </div>
        <div className="stack">
          <RequestsCard requests={s.requests} names={s.names} />
          <PurgedCard purged={s.purged} />
        </div>
      </div>
    </>
  );
}
