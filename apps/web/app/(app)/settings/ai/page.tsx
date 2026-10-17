import { notFound } from "next/navigation";
import { aiConfigured, blockedReason, REGIONS, voiceAllowed } from "@amax/ai";
import { aiStats } from "@amax/ai/admin";
import { rolesOf } from "@amax/auth";
import { SENSITIVITY_CLASSES } from "@amax/core/server";
import { loadEnv } from "@amax/core/env";
import { Ticket } from "@amax/ui";
import { getDb } from "../../../../lib/server";
import { getViewer } from "../../../../lib/viewer";
import { savePolicyAction } from "./actions";
import "../settings.css";

export const metadata = { title: "AI and data" };
export const dynamic = "force-dynamic";

// Every 002 class appears here (checked against SENSITIVITY_CLASSES below), plus two unclassified rows.
const CLASS_ROWS: { label: string; cls?: (typeof SENSITIVITY_CLASSES)[number]; usedBy: string }[] = [
  { label: "Projects, tasks, time", usedBy: "Chat, insights, ingestion" },
  { label: "Names and work email", usedBy: "Chat, inbox agent" },
  { label: "Pay", cls: "pay", usedBy: "Payroll agent sees differences only" },
  { label: "Health", cls: "health", usedBy: "Never sent unless allowed" },
  { label: "Bank details", cls: "bank", usedBy: "Never sent unless allowed" },
  { label: "Performance", cls: "performance", usedBy: "Insights, for HR and managers" },
  { label: "Candidate CVs", cls: "candidate", usedBy: "Match scores, for HR users" },
];

const missing = SENSITIVITY_CLASSES.filter((c) => !CLASS_ROWS.some((r) => r.cls === c));
if (missing.length) throw new Error(`AI and data screen has no row for ${missing.join(", ")}`);

export default async function AiSettingsPage() {
  const viewer = await getViewer();
  if (!viewer || !rolesOf(viewer).includes("Admin")) notFound();
  const env = loadEnv();
  const s = await aiStats(getDb()!, viewer.tenantId);
  const p = s.policy;
  const blocked = blockedReason(p) ?? (aiConfigured() ? null : "no API key is configured on the server");
  const redacted = Object.values(s.redactions).reduce((a, b) => a + b, 0);
  const sent = (cls?: string) => !cls || p.allowedClasses.includes(cls);
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><span>Settings</span><span>/</span>AI and data</nav>
      <div className="row head">
        <div>
          <h1>AI and data</h1>
          <p className="lede">
            {p.dataRegion ? `Your data stays in ${p.dataRegion}. ` : "No data region is set yet. "}
            Agents use Claude through the Claude API{p.providerRegion ? ` in ${p.providerRegion}` : ""}{p.zdrRequired ? ", with no data retained by the provider" : ""}, and {p.allowedClasses.length ? `only ${p.allowedClasses.join(", ")} of the classified fields may be sent` : "classified fields such as pay and health are never sent"}.
          </p>
        </div>
        <div className="actions"><a className="btn sm pillbtn" href="/settings/ai/usage">AI usage</a></div>
      </div>
      {blocked && <div className="viewbanner" role="alert">AI features are off: {blocked}.</div>}
      <div className="tickets four">
        <Ticket tone="info" label="Data region" value={p.dataRegion ?? "Not set"} note={blocked ? "Resolve the warning above" : "Database, files and AI in region"} />
        <Ticket tone="good" label="Calls this month" value={s.calls.toLocaleString("en-US")} note={`$${s.costUsd.toFixed(2)} in model cost${s.unpriced ? `, plus ${s.unpriced} call${s.unpriced === 1 ? "" : "s"} at unknown cost` : ""}`} />
        <Ticket tone="good" label="Fields redacted" value={redacted.toLocaleString("en-US")} note={Object.entries(s.redactions).map(([k, n]) => `${k[0].toUpperCase()}${k.slice(1)} ${n}`).join(", ") || "None yet"} />
        <Ticket tone="attention" label="Injection attempts flagged" value={String(s.injections)} note="Quoted as data, never followed" />
      </div>
      <div className="cols">
        <div className="card flush">
          <div className="card-head"><h2>What may be sent to the AI provider</h2><span className="chip agent">Policy v{p.version}</span></div>
          <div className="scroll-x">
            <table className="tbl">
              <caption className="sr">What may be sent to the AI provider</caption>
              <thead><tr><th>Data class</th><th>Sent</th><th>Used by</th></tr></thead>
              <tbody>
                {CLASS_ROWS.map((r) => (
                  <tr key={r.label}><td data-label="Data class">{r.label}</td><td data-label="Sent">{sent(r.cls) ? <span className="chip good">Allowed</span> : <span className="chip bad">Redacted</span>}</td><td data-label="Used by">{r.usedBy}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <div className="card-head"><h2>Provider</h2><span className="muted" style={{ fontSize: 13 }}>Set per tenant</span></div>
            <div className="row line"><span>Model</span><b>{env.AMAX_AI_MODEL}, then {env.AMAX_AI_FALLBACK_MODEL}</b></div>
            <div className="row line"><span>Region</span><b>{p.providerRegion ?? "Provider default"}</b></div>
            <div className="row line"><span>Provider keeps data</span><b>{p.zdrRequired ? (p.zdrConfirmed ? "No (confirmed)" : "Must be confirmed") : "Provider default"}</b></div>
            <div className="row line"><span>Prompt logging</span><b>Off</b></div>
            <div className="row line"><span>Voice input</span><b>{(() => { const v = voiceAllowed(p); return v.ok ? "On, sent to your browser's speech service" : p.voiceEnabled ? `Off: ${v.reason}` : "Off"; })()}</b></div>
          </div>
          <div className="card">
            <div className="card-head"><h2>Subprocessors</h2><span className="muted" style={{ fontSize: 13 }}>Shared with Compliance</span></div>
            <div className="row line"><span>Anthropic</span><b>AI{p.regions.ai ? `, ${p.regions.ai}` : ""}</b></div>
            <div className="row line"><span>Database host</span><b>Postgres{p.regions.database ? `, ${p.regions.database}` : ""}</b></div>
            {voiceAllowed(p).ok && <div className="row line"><span>Browser speech service</span><b>Voice audio, to the user's browser vendor (Google for Chrome, Microsoft for Edge, Apple for Safari)</b></div>}
          </div>
        </div>
      </div>
      <form className="card" action={savePolicyAction} style={{ marginTop: 28 }} aria-labelledby="pol-h">
        <div className="card-head"><h2 id="pol-h">Change policy</h2></div>
        <fieldset style={{ border: 0, padding: 0, display: "grid", gap: 10 }}>
          <legend className="muted">Classified fields that may be sent</legend>
          {SENSITIVITY_CLASSES.map((c) => (
            <label key={c}><input type="checkbox" name={`class-${c}`} defaultChecked={p.allowedClasses.includes(c)} /> {c}</label>
          ))}
          <label><input type="checkbox" name="enabled" defaultChecked={p.enabled} /> AI features on</label>
          <label><input type="checkbox" name="zdrConfirmed" defaultChecked={p.zdrConfirmed} /> Zero data retention confirmed with the provider</label>
          <label><input type="checkbox" name="voiceEnabled" defaultChecked={p.voiceEnabled} /> Voice input (audio goes to the browser vendor's speech service: Google, Microsoft or Apple; not available with a data region)</label>
          <label>AI provider region <input className="select" name="providerRegion" defaultValue={p.providerRegion ?? ""} placeholder="e.g. ap-southeast-2" /></label>
          {([["dataRegion", "Data region", p.dataRegion], ["aiRegion", "AI runs in", p.regions.ai], ["dbRegion", "Database in", p.regions.database], ["storageRegion", "Files in", p.regions.storage]] as const).map(([name, label, value]) => (
            <label key={name}>{label} <select className="select" name={name} defaultValue={value ?? ""}><option value="">Not set</option>{value && !(value in REGIONS) && <option value={value}>{value} (not recognised)</option>}{Object.entries(REGIONS).map(([code, n]) => <option key={code} value={code}>{n}</option>)}</select></label>
          ))}
        </fieldset>
        <button className="btn primary" type="submit" style={{ marginTop: 14 }}>Save policy</button>
      </form>
    </>
  );
}
