import { PinButton, Ticket } from "@amax/ui";
import { viewPin } from "../pins";
import type { Expenses } from "../server/view";

export function Tiles({ e }: { e: Expenses }) {
  return (
    <div className="tickets">
      <Ticket tone={e.waiting.count ? "info" : "good"} label="Waiting for you" art={<PinButton pin={viewPin("Expense claims waiting for you")} />} value={String(e.waiting.count)} note={e.waiting.note} />
      <Ticket tone="info" label="Approved, to pay" art={<PinButton pin={viewPin("Approved expense claims to pay")} />} value={String(e.toPay.count)} note={e.toPay.note} />
      <Ticket tone={e.flagged.count ? "problem" : "good"} label="Over the limit" art={<PinButton pin={viewPin("Expense claims over the limit")} />} value={String(e.flagged.count)} note={e.flagged.note} />
    </div>
  );
}
