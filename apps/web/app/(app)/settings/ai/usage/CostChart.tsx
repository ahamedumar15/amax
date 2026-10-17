import { PinButton } from "@amax/ui";
import { costLabel } from "@amax/ai/usage-format";
import type { AiUsage } from "@amax/ai/usage";

const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** One point per day of the month; each point is pinnable and reachable by keyboard. */
export function CostChart({ usage, days }: { usage: AiUsage; days: string[] }) {
  const byDay = new Map(usage.byDay.map((d) => [d.day, d]));
  const max = Math.max(0.01, ...usage.byDay.map((d) => d.costUsd ?? 0));
  const x = (i: number) => (days.length > 1 ? (i / (days.length - 1)) * 100 : 50);
  const y = (day: string) => 90 - ((byDay.get(day)?.costUsd ?? 0) / max) * 80;
  const pts = days.map((d, i) => `${x(i) * 6},${y(d) * 1.2}`).join(" ");
  const args = { scope: usage.scope, month: usage.month, ...(usage.source ? { source: usage.source } : {}), groupBy: "day" };
  return (
    <div className="usage-chart">
      <svg viewBox="0 0 600 120" preserveAspectRatio="none" role="img" aria-label={`Cost per day, ${usage.month}`}>
        <polyline fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" points={pts} />
      </svg>
      {days.map((d, i) => {
        const row = byDay.get(d);
        const label = `${dayLabel(d)}: ${row ? `${costLabel(row)}, ${row.calls} calls` : "no calls"}`;
        return (
          <div key={d} className="usage-pt pinnable" style={{ left: `${x(i)}%`, top: `${y(d)}%` }} title={label}>
            <i aria-hidden="true" className={row?.unknownCostCalls ? "unknown" : undefined} />
            <PinButton pin={{ label: `AI cost ${label}`, tool: "get_ai_usage", args: { ...args, key: d } }} />
          </div>
        );
      })}
    </div>
  );
}
