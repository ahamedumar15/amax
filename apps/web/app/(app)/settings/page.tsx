import { notFound } from "next/navigation";
import { PinButton } from "@amax/ui";
import { settingsStatus, type Area } from "../../../lib/admin";
import { adminDeps, getDb } from "../../../lib/server";
import { getViewer } from "../../../lib/viewer";
import "./settings.css";
import "./hub.css";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const LOGO: Record<string, [string, string]> = {
  keys: ["K", "var(--violet)"], integrations: ["M", "#24292F"], ai: ["✦", "linear-gradient(135deg,#7B61FF,#2FCB8C)"], "ai-usage": ["$", "#2F6FEB"],
  scheduler: ["S", "#E0A928"], audit: ["T", "#5059C9"], retention: ["R", "#E0697F"], backups: ["B", "#2FA37A"], api: ["A", "#6A6681"],
};
const RANK = { bad: 0, warn: 1, good: 2, info: 3 };

function HubCard({ a }: { a: Area }) {
  const [logo, color] = LOGO[a.id] ?? ["•", "var(--ink-3)"];
  return (
    <div className={`app-card pinnable${a.href ? "" : " soon"}`}>
      <PinButton pin={{ label: a.title, tool: "settings_overview", args: { area: a.id } }} />
      <div className="top2"><span className="logo-sq" style={{ background: color }} aria-hidden="true">{logo}</span><h2>{a.href ? <a href={a.href}>{a.title}</a> : a.title}</h2></div>
      <p>{a.blurb}</p>
      <div className="foot"><span>{a.stat}</span><span className={`chip ${a.chip.tone}`}>{a.chip.text}</span></div>
    </div>
  );
}

// The Settings hub (047 AC-1): every admin screen, what needs attention first.
export default async function SettingsHub() {
  const viewer = await getViewer();
  if (!viewer || !getDb()) notFound();
  const areas = await settingsStatus(adminDeps, viewer);
  if (!areas.length) notFound();
  const live = areas.filter((a) => a.href).sort((x, y) => RANK[x.chip.tone] - RANK[y.chip.tone]);
  const needs = live.filter((a) => a.attention);
  const lede = needs.length ? `${needs.length === 1 ? "One thing needs" : `${needs.length} things need`} you: ${needs.map((a) => a.attention).join("; ")}.` : "Nothing needs you right now.";
  return (
    <>
      <h1>Settings</h1>
      <p className="lede">How your organisation runs amax: credentials, integrations, AI, schedules and the audit trail. {lede} Changes happen in chat. Pin anything, then ask.</p>
      <div className="apps hub">{[...live, ...areas.filter((a) => !a.href)].map((a) => <HubCard key={a.id} a={a} />)}</div>
    </>
  );
}
