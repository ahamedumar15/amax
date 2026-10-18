import { PinButton } from "@amax/ui";
import { categoryPin, viewPin } from "../pins";
import type { CategoryView } from "../server/categories";

export function Categories({ rows }: { rows: CategoryView[] }) {
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Categories and limits</h2><PinButton pin={viewPin("Expense categories and limits")} /></div>
      <div className="scroll-x"><table className="tbl">
        <thead><tr><th>Category</th><th>Entity</th><th className="num">Limit per claim</th><th>Receipt needed</th><th className="num"><span className="sr">Pin</span></th></tr></thead>
        <tbody>{rows.map((k) => (
          <tr key={k.id} className="pinnable" data-category={`${k.key}-${k.currency}`}>
            <td data-label="Category">{k.name}{k.health && <small>Merchant and note shown to the claimant and HR only</small>}</td>
            <td data-label="Entity">{k.entity}</td>
            <td data-label="Limit per claim" className="num">{k.limitText}</td>
            <td data-label="Receipt needed">{k.receiptText}</td>
            <td className="num"><PinButton inline pin={categoryPin(k)} /></td>
          </tr>))}
        </tbody></table></div>
    </div>
  );
}
