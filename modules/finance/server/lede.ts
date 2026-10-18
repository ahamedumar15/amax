import type { ContractView } from "./rows";
import { monthLabel } from "./read";
import type { Overdue } from "./status";

export function ledeOf(contracts: ContractView[]): string {
  const parts: string[] = [];
  const unlock = contracts.map((c) => ({ c, v: /when (\S+) is in Prod/.exec(c.next)?.[1] })).find((x) => x.v);
  if (unlock) parts.push(`${unlock.c.client}'s next invoice unlocks when ${unlock.v} reaches Prod.`);
  for (const c of contracts.filter((x) => x.overdue.length)) {
    const days = Math.max(...c.overdue.map((o) => o.days));
    parts.push(`${c.projectName} has ${c.overdue.length === 1 ? "one invoice" : `${c.overdue.length} invoices`} ${days} days overdue.`);
  }
  return parts.join(" ") || "Every invoice is paid or not yet due.";
}

const due = (iso: string) => `${monthLabel(iso, "short")} ${Number(iso.slice(8, 10))}`;

export function overdueNote(overdue: Overdue[]): string {
  if (!overdue.length) return "Nothing overdue";
  if (overdue.length > 1) return `${overdue.length} invoices past due, the oldest due ${due(overdue[0].dueOn)}`;
  const o = overdue[0];
  return `${o.number}, ${o.source === "tm" && o.period ? `${monthLabel(o.period).split(" ")[0]} hours` : o.description}, due ${due(o.dueOn)}`;
}
