import { notFound } from "next/navigation";
import { canEver } from "@amax/auth";
import { listCredentialViews } from "@amax/auth/credentials-read";
import { apiStats, MAX_FAILURES, REPLAY_WINDOW_MS } from "@amax/api";
import { rateLimits } from "@amax/core/server";
import { PinButton } from "@amax/ui";
import { AskButton } from "../../../../components/settings/AskButton";
import { getDb } from "../../../../lib/server";
import { getViewer } from "../../../../lib/viewer";
import { ApiTickets } from "./ApiTickets";
import { Sprite } from "./Art";
import { CredentialTable } from "./CredentialTable";
import { lede } from "./format";
import { LimitTable } from "./LimitTable";
import { IncomingTable, OutgoingTable } from "./WebhookTables";
import "../keys/keys.css";
import "./api.css";

export const metadata = { title: "API and webhooks" };
export const dynamic = "force-dynamic";

const CREDS = { label: "Service credentials", tool: "list_api_credentials", args: {} };
const HOOKS = { label: "Outgoing webhooks", tool: "list_webhooks", args: {} };
const OVERVIEW = { label: "API and webhooks this week", tool: "get_api_overview", args: {} };

async function load() {
  const viewer = await getViewer();
  const db = getDb();
  if (!viewer || !db || !canEver(viewer, "api:credential:read") || !canEver(viewer, "api:webhook:read")) notFound();
  const [rows, stats] = await Promise.all([listCredentialViews(db, viewer.tenantId), apiStats(db, viewer.tenantId)]);
  return { rows, stats };
}

export default async function ApiPage() {
  const { rows, stats } = await load();
  const now = new Date();
  return (
    <div className="keys api">
      <Sprite />
      <nav className="crumb" aria-label="Breadcrumb"><a href="/settings">Settings</a><span>/</span>API and webhooks</nav>
      <div className="row head">
        <div><h1>API and webhooks</h1><p className="lede">{lede(rows, stats, now)} Changes happen in chat. Pin anything, then ask.</p></div>
        <div className="actions">
          <AskButton label="Add webhook" prompt="Send amax events to " pin={HOOKS} tool="subscribe_webhook" name="Ask amax to add a webhook" />
          <AskButton primary label="New credential" prompt="Create a service credential named " pin={CREDS} tool="create_api_credential" name="Ask amax to create a service credential" />
        </div>
      </div>
      <ApiTickets rows={rows} stats={stats} />
      <div className="card flush pinnable">
        <div className="card-head"><h2>Service credentials</h2><PinButton inline pin={CREDS} /><span className="muted" style={{ fontSize: 13 }}>Keys are shown once, then stored hashed</span></div>
        <CredentialTable rows={rows} now={now} />
      </div>
      <div className="card flush pinnable">
        <div className="card-head"><h2>Outgoing webhooks</h2><PinButton inline pin={HOOKS} /><span className="muted" style={{ fontSize: 13 }}>Signed with HMAC-SHA256 and a timestamp; switched off after {MAX_FAILURES} failures in a row</span></div>
        <OutgoingTable hooks={stats.webhooks} now={now} />
      </div>
      <div className="card flush pinnable">
        <div className="card-head"><h2>Incoming webhooks</h2><PinButton inline pin={OVERVIEW} /><span className="muted" style={{ fontSize: 13 }}>Verified with your secrets from Connections and keys, within {REPLAY_WINDOW_MS / 60_000} minutes, each signed event once</span></div>
        <IncomingTable inbound={stats.inbound} now={now} />
      </div>
      <div className="card flush pinnable">
        <div className="card-head"><h2>Rate limits this week</h2><PinButton inline pin={OVERVIEW} /><span className="muted" style={{ fontSize: 13 }}>Per token, person and organisation, across pages, the API and MCP</span></div>
        <LimitTable limited={stats.limited} limits={rateLimits()} />
      </div>
    </div>
  );
}
