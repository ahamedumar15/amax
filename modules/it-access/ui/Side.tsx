import { PinButton } from "@amax/ui";
import { productPin, viewPin } from "../pins";
import type { AccessView } from "../server/view";
import { AskButton } from "./AskButton";
import { Donut } from "./Donut";
import { Logo, plural, usd } from "./parts";

const pinFor = (id: string | null, name: string) => (id ? productPin({ id, name }) : viewPin(`${name} products`));

/** Spend by product for Admin; seats by product for anyone without the pricing class (055). */
export function Spend({ v }: { v: AccessView }) {
  const seats = [...v.products].sort((a, b) => b.assigned - a.assigned);
  const parts = v.pricing
    ? v.totals.spend.map((s) => ({ name: s.name, value: s.spendUsd, shown: usd(s.spendUsd), pin: pinFor(s.id, s.name) }))
    : [...seats.slice(0, 3).map((p) => ({ name: p.name, value: p.assigned, shown: String(p.assigned), pin: productPin(p) })),
      { name: "Other", value: seats.slice(3).reduce((n, p) => n + p.assigned, 0), shown: String(seats.slice(3).reduce((n, p) => n + p.assigned, 0)), pin: viewPin("Other products") }];
  const total = parts.reduce((n, p) => n + p.value, 0);
  return (
    <div className="card pinnable">
      <PinButton pin={viewPin(v.pricing ? "Spend by product" : "Seats by product")} />
      <div className="card-head"><h2>{v.pricing ? "Spend by product" : "Seats by product"}</h2><span className="muted">{v.pricing ? `${usd(total)} a month` : `${total} seats assigned`}</span></div>
      <Donut label={v.pricing ? "Spend by product" : "Seats by product"} parts={parts} center={v.pricing ? `$${(total / 1000).toFixed(1)}k` : String(total)} sub={v.pricing ? "per month" : "seats"} />
    </div>
  );
}

/** The licence agent's savings: products with enough idle seats. Review asks chat; IT approves the removal. */
export function Savings({ v }: { v: AccessView }) {
  return (
    <div className="card pinnable">
      <PinButton pin={viewPin("Licence savings")} />
      <div className="card-head"><h2>Licence savings</h2><span className="chip agent">Licence agent</span></div>
      {v.savings.length ? <ul className="list">{v.savings.map((s) => (
        <li key={s.productId} className="pinnable" data-saving={s.productId}>
          <div className="l"><Logo letter={s.logo} color={s.color} /><div>{plural(s.idle, `${s.name} seat`)} {s.rule === "never-used" ? "on people who never used it" : "unused for 60+ days"}
            <small>{v.pricing ? `Save ${usd(s.yearlyUsd)} a year. ` : ""}{Math.round(s.confidence * 100)}% confidence</small></div></div>
          <AskButton label="Review" pin={productPin({ id: s.productId, name: s.name })} name={`Review the ${s.name} saving with amax`}
            prompt={`Review the licence agent's suggestion to remove the ${s.idle} unused ${s.name} seats: show who holds them, then approve the removal if they're still unused`} />
          <PinButton pin={productPin({ id: s.productId, name: s.name })} />
        </li>))}</ul> : <p className="muted">No product has enough unused seats to suggest a removal.</p>}
    </div>
  );
}

export function Devices({ v }: { v: AccessView }) {
  const d = v.devices;
  const line = (label: string, n: number, warn = false) => (
    <div className="row line pinnable"><span>{label}</span><b className={warn && n ? "warn-t" : undefined}>{n}</b><PinButton pin={viewPin(`Devices: ${label.toLowerCase()}`)} /></div>
  );
  return (
    <div className="card pinnable">
      <PinButton pin={viewPin("Devices")} />
      <div className="card-head"><h2>Devices</h2><span className="muted">From Intune</span></div>
      {line("Compliant", d.compliant)}{line("Need an OS update", d.needsUpdate, true)}{line("Not assigned to anyone", d.unassigned)}
    </div>
  );
}
