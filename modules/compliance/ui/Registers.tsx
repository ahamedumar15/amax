import { EmptyState, IntentButton, PinButton } from "@amax/ui";
import type { Risk } from "../server/registers";
import type { Supplier } from "../server/supplier-read";
import { shortDate } from "./parts";

const LEVEL: Record<string, string> = { high: "bad", medium: "warn", low: "good" };
const risksPin = { label: "Open risks", tool: "list_risks", args: {} };
const suppliersPin = { label: "Suppliers and subprocessors", tool: "list_suppliers", args: {} };
const supplierPin = (s: Supplier) => (s.id ? { label: s.name, tool: "get_supplier", args: { supplierId: s.id } } : { label: `${s.name} (platform)`, tool: "list_suppliers", args: {} });

export function Risks({ rows, manage }: { rows: Risk[]; manage: boolean }) {
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Open risks</h2><PinButton inline pin={risksPin} />{manage && <IntentButton intent="compliance.new-risk" label="New risk" primary={false} />}</div>
      {rows.length === 0 ? <EmptyState icon="doc" title="No open risks" hint="Ask amax to add one; it is rated by likelihood and impact." /> : (
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Open risks, highest rated first</caption>
          <thead><tr><th>Risk</th><th>Owner</th><th>Rating</th><th>Review by</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="pinnable">
                <td data-label="Risk"><b>{r.title}</b><small>{r.ref}{r.treatment ? `. ${r.treatment}` : ""}</small></td>
                <td data-label="Owner">{r.ownerName ?? "Unassigned"}</td>
                <td data-label="Rating"><span className={`chip ${LEVEL[r.level]}`}>{r.level[0].toUpperCase()}{r.level.slice(1)}, {r.score}</span></td>
                <td data-label="Review by" className="act">{r.reviewOn ? shortDate(r.reviewOn) : "Not set"}<PinButton pin={{ label: `${r.ref} ${r.title}`, tool: "get_risk", args: { riskId: r.id } }} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

export function Suppliers({ rows }: { rows: Supplier[] }) {
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Suppliers and subprocessors</h2><PinButton inline pin={suppliersPin} /><span className="muted" style={{ fontSize: 13 }}>{rows.filter((s) => s.subprocessor && s.status === "active").length} subprocessors</span></div>
      <div className="scroll-x"><table className="tbl">
        <caption className="sr">Suppliers and subprocessors, the platform&apos;s own first</caption>
        <thead><tr><th>Supplier</th><th>Data</th><th>Region</th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id ?? s.name} className="pinnable">
              <td data-label="Supplier"><b>{s.name}</b><small>{s.service}{s.source === "platform" ? ", from AI and data settings" : s.subprocessor ? "" : ", not a subprocessor"}</small></td>
              <td data-label="Data">{s.data ?? "None"}</td>
              <td data-label="Region" className="act">{s.region ?? "Not set"}<PinButton pin={supplierPin(s)} /></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
