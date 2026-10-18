import { CONTRACT_KINDS, KIND_LABELS } from "../contracts";
import type { Financials } from "../server/view";

const csv = (f: Financials) => [["Project", "Contract", "Currency", "Value", "Invoiced", "Next invoice", "Payments"],
  ...f.contracts.map((c) => [c.projectName, c.kindLabel, c.currency, c.value, c.invoiced, c.next, c.payments.text])].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");

export function ContractActions({ f }: { f: Financials }) {
  return (
    <div className="actions">
      <details className="filter">
        <summary className="btn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>Filter</summary>
        <nav aria-label="Filter contracts"><a href="/finance">All contracts</a>{CONTRACT_KINDS.map((k) => <a key={k} href={`/finance?kind=${k}`}>{KIND_LABELS[k]}</a>)}</nav>
      </details>
      <a className="btn primary" download={`contracts-${f.asOf}.csv`} href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv(f))}`}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-4-4 4 4 4-4M5 20h14" /></svg>Download</a>
    </div>
  );
}
