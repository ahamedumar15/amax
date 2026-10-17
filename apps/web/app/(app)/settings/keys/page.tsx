import { notFound } from "next/navigation";
import { ForbiddenError } from "@amax/core/server";
import { CONNECTOR_IDS, listCredentials, type ConnectorId } from "@amax/core/secrets";
import { getDb } from "../../../../lib/server";
import { getViewer } from "../../../../lib/viewer";
import { Sprite } from "./Art";
import { lede } from "./format";
import { KeyForm } from "./KeyForm";
import { KeyTable } from "./KeyTable";
import { KeyTickets } from "./KeyTickets";
import "./keys.css";

export const metadata = { title: "Connections and keys" };
export const dynamic = "force-dynamic";

type Search = { add?: string; rotate?: string; error?: string };

async function load() {
  const viewer = await getViewer();
  if (!viewer || !getDb()) notFound();
  try {
    return await listCredentials({ tenantId: viewer.tenantId, actor: { id: `user:${viewer.userId}`, kind: "user", roles: viewer.actualRoles }, source: "ui", viewer });
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
}

export default async function KeysPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [data, q] = await Promise.all([load(), searchParams]);
  const now = new Date();
  const active = new Set(data.rows.filter((r) => r.status !== "revoked").map((r) => r.connector));
  const rotate = data.rows.find((r) => r.connector === q.rotate && r.status !== "revoked")?.connector;
  const choices = CONNECTOR_IDS.filter((c) => !active.has(c));
  return (
    <div className="keys">
      <Sprite />
      <nav className="crumb" aria-label="Breadcrumb"><span>Settings</span><span>/</span>Connections and keys</nav>
      <div className="row head">
        <div><h1>Connections and keys</h1><p className="lede">{lede(data.tenantName, data.rows, now)}</p></div>
        <form className="actions" method="get"><button className="btn primary" name="add" value="1" disabled={!data.key || !choices.length}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Add credential</button></form>
      </div>
      {!data.key && <div className="viewbanner" role="alert">Connector credentials are off: no key service is configured on the server (AMAX_KMS).</div>}
      {data.key && (rotate || (q.add && choices.length > 0)) && <KeyForm mode={rotate ? "rotate" : "add"} connector={rotate as ConnectorId | undefined} choices={choices} error={q.error} />}
      <KeyTickets rows={data.rows} now={now} />
      <div className="card flush">
        <div className="card-head"><h2>Credentials</h2><span className="muted" style={{ fontSize: 13 }}>Key: {data.key ?? "not configured"}</span></div>
        <KeyTable rows={data.rows} now={now} />
      </div>
    </div>
  );
}
