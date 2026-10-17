import { notFound } from "next/navigation";
import { ForbiddenError } from "@amax/core/server";
import { listCredentials } from "@amax/core/secrets";
import { PinButton } from "@amax/ui";
import { AskButton } from "../../../../components/settings/AskButton";
import { getDb } from "../../../../lib/server";
import { getViewer } from "../../../../lib/viewer";
import { Sprite } from "./Art";
import { adminContext } from "./context";
import { lede } from "./format";
import { KeyTable } from "./KeyTable";
import { KeyTickets } from "./KeyTickets";
import "./keys.css";

export const metadata = { title: "Connections and keys" };
export const dynamic = "force-dynamic";

const ALL = { label: "Connections and keys", tool: "list_secrets", args: {} };

async function load() {
  const viewer = await getViewer();
  if (!viewer || !getDb()) notFound();
  try {
    return await listCredentials(adminContext(viewer));
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
}

// Chat-first (047): no forms here. Every change is an "Ask amax" chip that opens chat with the
// credential pinned; a new value is typed only into the masked field on chat's confirm card.
export default async function KeysPage() {
  const data = await load();
  const now = new Date();
  return (
    <div className="keys">
      <Sprite />
      <nav className="crumb" aria-label="Breadcrumb"><a href="/settings">Settings</a><span>/</span>Connections and keys</nav>
      <div className="row head">
        <div><h1>Connections and keys</h1><p className="lede">{lede(data.tenantName, data.rows, now)} Changes happen in chat. Pin anything, then ask.</p></div>
        <div className="actions"><AskButton primary label="Ask amax to add a credential" prompt="Add a credential for " pin={ALL} tool="put_secret" /></div>
      </div>
      {!data.key && <div className="viewbanner" role="alert">Connector credentials are off: no key service is configured on the server (AMAX_KMS).</div>}
      <KeyTickets rows={data.rows} now={now} />
      <div className="card flush pinnable">
        <div className="card-head"><h2>Credentials</h2><PinButton inline pin={ALL} /><span className="muted" style={{ fontSize: 13 }}>Key: {data.key ?? "not configured"}</span></div>
        <KeyTable rows={data.rows} now={now} />
      </div>
    </div>
  );
}
