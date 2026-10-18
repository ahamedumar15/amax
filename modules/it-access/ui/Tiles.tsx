import { PinButton, Ticket } from "@amax/ui";
import { viewPin } from "../pins";
import type { AccessView } from "../server/view";
import { plural, usd } from "./parts";

// The four stats from the mock: spend (Admin only, 055 pricing), unused seats, devices, leavers.
export function Tiles({ v }: { v: AccessView }) {
  const t = v.totals, d = v.devices;
  const pin = (what: string) => <PinButton pin={viewPin(what)} />;
  const pct = d.total ? Math.floor((1000 * d.compliant) / d.total) / 10 : 100;
  return (
    <div className="tickets four">
      <Ticket tone="info" label="Licence spend, monthly" art={pin("Licence spend")} value={v.pricing ? usd(t.monthlyUsd) : "For Admin"}
        note={v.pricing ? plural(t.products, "product") : `${plural(t.products, "product")}; prices are shown to Admin only`} />
      <Ticket tone="attention" label="Unused seats" art={pin("Unused seats")} value={String(t.unused)} note={v.pricing ? `${usd(t.unusedUsd)} a month to save` : "Unused for 60 days or more"} />
      <Ticket tone="good" label="Devices compliant" art={pin("Devices compliant")} value={`${pct}%`}
        progress={{ percent: pct, label: `${pct}% of ${plural(d.total, "device")}; ${d.needsUpdate} need${d.needsUpdate === 1 ? "s" : ""} updates` }} />
      <Ticket tone={v.leaversWithAccess ? "problem" : "good"} label="Leavers with access" art={pin("Leavers with access")} value={String(v.leaversWithAccess)}
        note={v.leaversWithAccess ? "Past their last day and still holding access" : "Revoked on the last day"} />
    </div>
  );
}
