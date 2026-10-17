import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentViewer, rolesOf } from "@amax/auth";
import { connectedClients, revokeClient, toolCatalogue } from "@amax/mcp/admin";
import { getDb, toolRegistry } from "../../../../lib/server";
import { getViewer } from "../../../../lib/viewer";
import "../settings.css";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

async function revoke(data: FormData) {
  "use server";
  const v = await currentViewer();
  if (!rolesOf(v).includes("Admin")) throw new Error("forbidden: Admin only");
  await revokeClient(getDb()!, v.tenantId, String(data.get("clientId")));
  revalidatePath("/settings/integrations");
}

export default async function IntegrationsPage() {
  const viewer = await getViewer();
  if (!viewer || !rolesOf(viewer).includes("Admin")) notFound();
  const tools = toolCatalogue(toolRegistry(), viewer.tenantId);
  const clients = await connectedClients(getDb()!, viewer.tenantId);
  const modules = [...new Set(tools.map((t) => t.module))];
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><span>Settings</span><span>/</span>Integrations</nav>
      <div className="row head"><div><h1>Integrations</h1><p className="lede">Every amax capability is an MCP tool with the same permissions as the screens. Claude and other MCP clients connect at <code>/api/mcp</code> with OAuth; each person approves the scopes.</p></div></div>
      <div className="card flush" style={{ marginBottom: 28 }}>
        <div className="card-head"><h2>Connected clients</h2><span className="muted" style={{ fontSize: 13 }}>{clients.length} active</span></div>
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Connected clients</caption>
          <thead><tr><th>Client</th><th>Person</th><th>Scopes</th><th>Last sign-in</th><th className="num"><span className="sr">Actions</span></th></tr></thead>
          <tbody>
            {clients.length === 0 && <tr><td colSpan={5} className="muted">No MCP clients connected yet.</td></tr>}
            {clients.map((c) => (
              <tr key={`${c.clientId}-${c.userName}`}><td data-label="Client"><b>{c.clientName}</b></td><td data-label="Person">{c.userName}</td><td data-label="Scopes">{c.scopes.join(", ")}</td>
                <td data-label="Last sign-in">{new Date(c.lastAuth).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })}</td>
                <td className="num"><form action={revoke}><input type="hidden" name="clientId" value={c.clientId} /><button className="btn sm" type="submit">Revoke</button></form></td></tr>
            ))}
          </tbody>
        </table></div>
      </div>
      {modules.map((m) => (
        <div className="card flush" key={m} style={{ marginBottom: 28 }}>
          <div className="card-head"><h2>{m === "core" ? "Built in" : m}</h2><span className="muted" style={{ fontSize: 13 }}>{tools.filter((t) => t.module === m).length} tools</span></div>
          <div className="scroll-x"><table className="tbl">
            <caption className="sr">{m} tools</caption>
            <thead><tr><th>Tool</th><th>Scope</th><th>Who can use it</th></tr></thead>
            <tbody>
              {tools.filter((t) => t.module === m).map((t) => (
                <tr key={t.name}><td data-label="Tool"><b><code>{t.name}</code></b><small>{t.description}</small></td>
                  <td data-label="Scope"><span className={`chip ${t.scope === "write" ? "warn" : t.scope === "sensitive" ? "bad" : "good"}`}>{t.scope}</span>{t.destructive && <span className="chip bad">destructive</span>}</td>
                  <td data-label="Who can use it">{t.roles.join(", ")}</td></tr>
              ))}
            </tbody>
          </table></div>
        </div>
      ))}
    </>
  );
}
