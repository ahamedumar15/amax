import { notFound } from "next/navigation";
import { aiConfigured, aiEndpoint, blockedReason, PROVIDER_DEFAULT, voiceAllowed } from "@amax/ai";
import { aiStats } from "@amax/ai/admin";
import { can, canSeePricing } from "@amax/auth";
import { PRICE_HIDDEN } from "@amax/ai/usage-format";
import { SENSITIVITY_CLASSES } from "@amax/core/server";
import { loadEnv } from "@amax/core/env";
import { PinButton } from "@amax/ui";
import { AskButton } from "../../../../components/settings/AskButton";
import { PinnedTicket as Ticket } from "../../../../components/settings/PinnedTicket";
import { getDb } from "../../../../lib/server";
import { getViewer } from "../../../../lib/viewer";
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

const POLICY = { label: "AI and data policy", tool: "get_ai_policy", args: {} };
const pin = (label: string) => ({ label, tool: "get_ai_policy", args: {} });

const missing = SENSITIVITY_CLASSES.filter((c) => !CLASS_ROWS.some((r) => r.cls === c));
if (missing.length) throw new Error(`AI and data screen has no row for ${missing.join(", ")}`);

export default async function AiSettingsPage() {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "ai:policy:manage")) notFound();
  const env = loadEnv();
  const s = await aiStats(getDb()!, viewer.tenantId);
  const p = s.policy;
  const blocked = blockedReason(p) ?? (aiConfigured() ? null : "no API key is configured on the server");
  const redacted = Object.values(s.redactions).reduce((a, b) => a + b, 0);
  const sent = (cls?: string) => !cls || p.allowedClasses.includes(cls);
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><a href="/settings">Settings</a><span>/</span>AI and data</nav>
      <div className="row head">
        <div>
          <h1>AI and data</h1>
          <p className="lede">
            {p.dataRegion ? `Your data stays in ${p.dataRegion}. ` : "No data region is set yet. "}
            Agents use Claude through the Claude API{p.providerRegion ? ` in ${p.providerRegion}` : ""}{p.zdrRequired ? ", with no data retained by the provider" : ""}, and {p.allowedClasses.length ? `only ${p.allowedClasses.join(", ")} of the classified fields may be sent` : "classified fields such as pay and health are never sent"}. Changes happen in chat. Pin anything, then ask.
          </p>
        </div>
        <div className="actions"><a className="btn sm pillbtn" href="/settings/ai/usage">AI usage</a><AskButton primary label="Ask amax to change the policy" prompt="Change the AI policy: " pin={POLICY} tool="set_ai_policy" /></div>
      </div>
      {blocked && <div className="viewbanner" role="alert">AI features are off: {blocked}.</div>}
      <div className="tickets four">
        <Ticket pin={pin("Data region")} tone="info" label="Data region" value={p.dataRegion ?? "Not set"} note={blocked ? "Resolve the warning above" : "Database, files and AI in region"} />
        <Ticket pin={pin("Calls this month")} tone="good" label="Calls this month" value={s.calls.toLocaleString("en-US")} note={`${canSeePricing(viewer) ? `$${s.costUsd.toFixed(2)} in model cost` : `Model cost ${PRICE_HIDDEN.toLowerCase()}`}${s.unpriced ? `, plus ${s.unpriced} call${s.unpriced === 1 ? "" : "s"} at unknown cost` : ""}`} />
        <Ticket pin={pin("Fields redacted")} tone="good" label="Fields redacted" value={redacted.toLocaleString("en-US")} note={Object.entries(s.redactions).map(([k, n]) => `${k[0].toUpperCase()}${k.slice(1)} ${n}`).join(", ") || "None yet"} />
        <Ticket pin={pin("Injection attempts flagged")} tone="attention" label="Injection attempts flagged" value={String(s.injections)} note="Quoted as data, never followed" />
      </div>
      <div className="cols">
        <div className="card flush pinnable">
          <div className="card-head"><h2>What may be sent to the AI provider</h2><PinButton inline pin={POLICY} /><span className="chip agent">Policy v{p.version}</span></div>
          <div className="scroll-x">
            <table className="tbl">
              <caption className="sr">What may be sent to the AI provider</caption>
              <thead><tr><th>Data class</th><th>Sent</th><th>Used by</th><th className="num"><span className="sr">Ask</span></th></tr></thead>
              <tbody>
                {CLASS_ROWS.map((r) => (
                  <tr key={r.label} className="pinnable"><td data-label="Data class">{r.label}</td><td data-label="Sent">{sent(r.cls) ? <span className="chip good">Allowed</span> : <span className="chip bad">Redacted</span>}</td><td data-label="Used by">{r.usedBy}</td>
                    <td className="num">{r.cls && <AskButton label={sent(r.cls) ? "Ask to redact" : "Ask to allow"} prompt={sent(r.cls) ? `Stop sending ${r.cls} fields to the AI provider` : `Allow ${r.cls} fields to be sent to the AI provider`} pin={pin(r.label)} tool="set_ai_policy" name={`${sent(r.cls) ? "Ask to redact" : "Ask to allow"} ${r.label}`} />}<PinButton pin={pin(r.label)} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="stack">
          <div className="card pinnable">
            <div className="card-head"><h2>Provider</h2><PinButton inline pin={pin("AI provider")} /><span className="muted" style={{ fontSize: 13 }}>Set per tenant</span></div>
            <div className="row line"><span>Model</span><b>{env.AMAX_AI_MODEL}, then {env.AMAX_AI_FALLBACK_MODEL}</b></div>
            <div className="row line"><span>Region</span><b>{p.providerRegion ?? "Provider default"}</b></div>
            <div className="row line"><span>Endpoint</span><b>{aiEndpoint().url ?? `${PROVIDER_DEFAULT} (provider default)`}</b></div>
            <div className="row line"><span>Endpoint region</span><b>{aiEndpoint().region ?? "Not configured on the server"}</b></div>
            <div className="row line"><span>Provider keeps data</span><b>{p.zdrRequired ? (p.zdrConfirmed ? "No (confirmed)" : "Must be confirmed") : "Provider default"}</b></div>
            <div className="row line"><span>Prompt logging</span><b>Off</b></div>
            <div className="row line"><span>Voice input</span><b>{(() => { const v = voiceAllowed(p); return v.ok ? "On, sent to your browser's speech service" : p.voiceEnabled ? `Off: ${v.reason}` : "Off"; })()}</b></div>
          </div>
          <div className="card pinnable">
            <div className="card-head"><h2>Subprocessors</h2><PinButton inline pin={pin("Subprocessors")} /><span className="muted" style={{ fontSize: 13 }}>Shared with Compliance</span></div>
            <div className="row line"><span>Anthropic</span><b>AI{p.regions.ai ? `, ${p.regions.ai}` : ""}</b></div>
            <div className="row line"><span>Database host</span><b>Postgres{p.regions.database ? `, ${p.regions.database}` : ""}</b></div>
            {voiceAllowed(p).ok && <div className="row line"><span>Browser speech service</span><b>Voice audio, to the user's browser vendor (Google for Chrome, Microsoft for Edge, Apple for Safari)</b></div>}
          </div>
        </div>
      </div>
    </>
  );
}
