import type { UsageTotals } from "./usage";

export const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 055: what a money figure reads as for a role without the pricing class. */
export const PRICE_HIDDEN = "Hidden for your role";

/** Unknown-cost calls are named, never folded in as $0 (AC-5). A cost left out (055) is hidden, never $0. */
export function costLabel(t: Pick<UsageTotals, "costUsd" | "unknownCostCalls">) {
  if (t.costUsd === undefined) return PRICE_HIDDEN;
  if (t.costUsd === null) return t.unknownCostCalls ? "Unknown" : usd(0);
  return t.unknownCostCalls ? `${usd(t.costUsd)} + unknown` : usd(t.costUsd);
}

export function compact(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
