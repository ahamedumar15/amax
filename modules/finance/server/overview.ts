import type { OverviewPart } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { listProjectRefs } from "@amax/delivery/contracts";
import { readyToInvoice } from "../contracts";
import { money } from "./fmt";
import { read } from "./read";

// 068 AC-1: the Ready to invoice ticket, from open drafts in the largest currency; other currencies are named, never added in.
export const financeOverview = (v: Viewer): Promise<OverviewPart> =>
  read(v, async (tx) => {
    const [main, ...others] = await readyToInvoice(tx, v);
    if (!main) return { tickets: [{ key: "finance.ready", order: 30, tone: "good", label: "Ready to invoice", value: "Nothing yet", note: "No open invoice drafts", pin: { label: "Financials", tool: "get_financials", args: {} } }] };
    const names = new Map((await listProjectRefs(tx)).map((p) => [p.id, p.name]));
    const top = main.lines.slice(0, 2).map((l) => `${names.get(l.projectId) ?? "Contract"} ${money(l.amount, main.currency)}`);
    const more = main.lines.length > 2 ? ` + ${main.lines.length - 2} more` : "";
    const elsewhere = others.length ? `, plus drafts in ${others.map((o) => o.currency).join(", ")}` : "";
    return {
      tickets: [{ key: "finance.ready", order: 30, tone: "good", label: "Ready to invoice", value: money(main.total, main.currency), note: `${top.join(" + ")}${more}${elsewhere}`,
        pin: main.lines.length === 1 ? { label: "Ready to invoice", tool: "get_contract", args: { contractId: main.lines[0].contractId } } : { label: "Ready to invoice", tool: "get_financials", args: {} } }],
    };
  });
