import { notFound } from "next/navigation";
import { aiUsage, monthOf, USAGE_SOURCES, type AiUsage, type UsageSource } from "@amax/ai/usage";
import { compact, costLabel, plural, PRICE_HIDDEN, usd } from "@amax/ai/usage-format";
import { AI_USAGE_READ, usageViewer } from "@amax/ai/usage-tool";
import { can } from "@amax/auth";
import { PinButton, Ticket, type TicketTone } from "@amax/ui";
import { getDb } from "../../../../../lib/server";
import { getViewer } from "../../../../../lib/viewer";
import { CostChart } from "./CostChart";
import { UsageFilters } from "./UsageFilters";
import { UsageTables } from "./UsageTables";
import "../../settings.css";

export const metadata = { title: "AI usage" };
export const dynamic = "force-dynamic";

const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const lastMonths = (now: Date) => Array.from({ length: 12 }, (_, i) => monthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
const daysOf = (m: string, now: Date) => {
  const [y, mo] = m.split("-").map(Number);
  const last = m === monthOf(now) ? now.getUTCDate() : new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${m}-${String(i + 1).padStart(2, "0")}`);
};

const bySource = (u: AiUsage) => {
  const used = (Object.keys(USAGE_SOURCES) as UsageSource[]).filter((s) => u.bySource[s].costUsd !== null || u.bySource[s].unknownCostCalls);
  const text = used.map((s) => `${s} ${costLabel(u.bySource[s]).toLowerCase()}`).join(", ");
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "No calls yet";
};

// What the month cost, in words; for a role without the pricing class (055), only that prices are hidden.
function costText(u: AiUsage) {
  const t = u.totals;
  if (t.costUsd === undefined) return ". Prices are hidden for your role.";
  const top = u.byPerson.find((p) => p.name && p.costUsd !== null);
  return `, ${t.costUsd === null ? (t.calls ? "at unknown cost" : "costing nothing") : `costing ${usd(t.costUsd)}`}.${top ? ` ${top.name}'s AI use cost the most.` : ""}${
    t.unknownCostCalls && t.costUsd !== null ? ` ${plural(t.unknownCostCalls, "call")} used a model without a known price, so the total is a lower bound.` : ""}`;
}

type TicketRow = { tone: TicketTone; label: string; value: string; note: string; hidden?: boolean };

export default async function AiUsagePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, AI_USAGE_READ)) notFound();
  const now = new Date();
  const sp = await searchParams;
  const months = lastMonths(now);
  const month = months.includes(sp.month ?? "") ? sp.month! : months[0];
  const source = sp.source && sp.source in USAGE_SOURCES ? (sp.source as UsageSource) : undefined;
  const u = await aiUsage(getDb()!, usageViewer(viewer), { scope: "tenant", month, source });
  const t = u.totals;
  const args = { scope: "tenant", month, ...(source ? { source } : {}) };
  const tickets: TicketRow[] = [
    u.pricing ? { tone: "good", label: "Cost", value: costLabel(t), note: bySource(u) } : { tone: "good", label: "Cost", value: "Hidden", note: PRICE_HIDDEN, hidden: true },
    { tone: "good", label: "Calls", value: t.calls.toLocaleString("en-US"), note: plural(t.people, "person", "people") },
    { tone: "info", label: "Tokens", value: compact(t.inputTokens + t.outputTokens), note: `${compact(t.inputTokens)} in, ${compact(t.outputTokens)} out` },
    { tone: "attention", label: "Unknown cost", value: plural(t.unknownCostCalls, "call"), note: "Model without a price" },
  ];
  const perDay = u.pricing ? "Cost per day" : "Calls per day";
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><span>Settings</span><span>/</span><a href="/settings/ai">AI and data</a><span>/</span>AI usage</nav>
      <div className="row head">
        <div>
          <h1>AI usage</h1>
          <p className="lede">{monthName(month)}{month === months[0] ? " so far" : ""}: {plural(t.calls, "call")} across {plural(t.people, "person", "people")}{costText(u)}</p>
        </div>
        <UsageFilters month={month} source={source ?? ""} months={months.map((m) => ({ value: m, label: monthName(m) }))} />
      </div>
      <div className="tickets four">
        {tickets.map(({ hidden, ...k }) => hidden
          ? <div key={k.label} data-pricing-hidden=""><Ticket {...k} /></div>
          : <div key={k.label} className="pinnable"><Ticket {...k} /><PinButton pin={{ label: `AI usage: ${k.label.toLowerCase()}, ${monthName(month)}`, tool: "get_ai_usage", args }} /></div>)}
      </div>
      <div className="card pinnable" style={{ marginTop: 28 }}>
        <div className="card-head"><h2>{perDay}</h2><PinButton inline pin={{ label: `AI ${perDay.toLowerCase()}, ${monthName(month)}`, tool: "get_ai_usage", args: { ...args, groupBy: "day" } }} /></div>
        <CostChart usage={u} days={daysOf(month, now)} />
      </div>
      <UsageTables usage={u} now={now} />
    </>
  );
}
