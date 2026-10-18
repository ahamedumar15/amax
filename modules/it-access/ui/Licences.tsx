import { PinButton } from "@amax/ui";
import { productPin, viewPin } from "../pins";
import { SAVING_MIN_SEATS, type AccessView } from "../server/view";
import { plural, usd, Logo } from "./parts";

// The products with unused seats, then the total. Money columns only with the pricing class (055).
export function Licences({ v }: { v: AccessView }) {
  const rows = v.products.filter((p) => p.idle > 0);
  const rest = v.products.length - rows.length;
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Licences</h2><PinButton pin={viewPin("Licences")} /></div>
      <div className="scroll-x"><table className="tbl">
        <thead><tr><th>Product</th><th className="num">Seats</th><th>Assigned</th><th className="num">Active 30 d</th>{v.pricing && <th className="num">Monthly</th>}<th>Unused seats</th>
          {v.pricing && <th className="num">Unused cost</th>}<th className="num"><span className="sr">Pin</span></th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="pinnable" data-product={p.key}>
              <td><div className="who"><Logo letter={p.logo} color={p.color} />{p.name}</div></td>
              <td className="num">{p.seats}</td>
              <td><div className="row"><div className="meter" role="img" aria-label={`${p.assigned} of ${p.seats} seats assigned`}><i style={{ width: `${Math.round((100 * p.assigned) / (p.seats || 1))}%` }} /></div>{p.assigned}</div></td>
              <td className="num">{p.active30}</td>
              {v.pricing && <td className="num">{usd(p.monthlyUsd)}</td>}
              <td><span className={`chip${p.idle >= SAVING_MIN_SEATS ? " warn" : ""}`}>{p.idle}</span></td>
              {v.pricing && <td className="num">{usd(p.unusedUsd)}{p.unusedNote && <small>{p.unusedNote}</small>}</td>}
              <td className="num"><PinButton inline pin={productPin(p)} /></td>
            </tr>
          ))}
          <tr className="total pinnable">
            <td>Unused, all products</td><td /><td /><td />{v.pricing && <td />}<td><span className="chip">{v.totals.unused}</span></td>
            {v.pricing && <td className="num">{usd(v.totals.unusedUsd)}<small>a month</small></td>}
            <td className="num"><PinButton inline pin={viewPin("Unused seats, all products")} /></td>
          </tr>
        </tbody></table></div>
      {rest > 0 && <p className="foot-note">{plural(rest, "more product")} {rest === 1 ? "has" : "have"} no unused seats.</p>}
    </div>
  );
}
