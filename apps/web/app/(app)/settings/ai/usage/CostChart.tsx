import { PinButton } from "@amax/ui";
import { costLabel, plural } from "@amax/ai/usage-format";
import type { AiUsage } from "@amax/ai/usage";

const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Cost per day; calls per day for a role without the pricing class (055), so no money figure is drawn. */
export function CostChart({ usage, days }: { usage: AiUsage; days: string[] }) {
  const byDay = new Map(usage.byDay.map((d) => [d.day, d]));
  const value = (d?: AiUsage["byDay"][number]) => (usage.pricing ? (d?.costUsd ?? 0) : (d?.calls ?? 0));
  const max = Math.max(usage.pricing ? 0.01 : 1, ...usage.byDay.map(value));
  const x = (i: number) => (days.length > 1 ? (i / (days.length - 1)) * 100 : 50);
  const y = (day: string) => 90 - (value(byDay.get(day)) / max) * 80;
  const pts = days.map((d, i) => `${x(i) * 6},${y(d) * 1.2}`).join(" ");
  const args = { scope: usage.scope, month: usage.month, ...(usage.source ? { source: usage.source } : {}), groupBy: "day" };
  const what = usage.pricing ? "Cost" : "Calls";
  return (
    <div className="usage-chart">
      <svg viewBox="0 0 600 120" preserveAspectRatio="none" role="img" aria-label={`${what} per day, ${usage.month}`}>
        <polyline fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" points={pts} />
      </svg>
      {days.map((d, i) => {
        const row = byDay.get(d);
        const label = `${dayLabel(d)}: ${row ? (usage.pricing ? `${costLabel(row)}, ${row.calls} calls` : plural(row.calls, "call")) : "no calls"}`;
        return (
          <div key={d} className="usage-pt pinnable" style={{ left: `${x(i)}%`, top: `${y(d)}%` }} title={label}>
            <i aria-hidden="true" className={row?.unknownCostCalls ? "unknown" : undefined} />
            <PinButton pin={{ label: `AI ${usage.pricing ? "cost" : "calls"} ${label}`, tool: "get_ai_usage", args: { ...args, key: d } }} />
          </div>
        );
      })}
    </div>
  );
}
