import type { Entity, RuleView } from "@amax/core/privacy";
import { PinButton } from "@amax/ui";
import { AskButton } from "../../../../components/settings/AskButton";
import { CLASS_CHIP, periodLabel, startsLabel } from "./format";

type Extra = { label: string; period?: string; starts: string; ships?: string };
type Props = { rules: RuleView[]; entity: Entity | null; entities: Entity[]; defaults: Extra[]; appendOnly: Extra[] };

function Kept({ r }: { r: RuleView }) {
  const why = r.statutory && r.statutory.period === r.period ? "statutory minimum" : r.override ? "set by your organisation" : null;
  return <>{periodLabel(r.period)}{why && <small>{why}</small>}{r.paused && <small>Paused by a legal hold</small>}</>;
}

function Row({ r, entity }: { r: RuleView; entity: Entity | null }) {
  const [tone, cls] = CLASS_CHIP[r.class] ?? ["info", r.class];
  const pin = { label: r.label, tool: "get_retention_rule", args: { rule: r.id, ...(entity ? { entity: entity.id } : {}) } };
  return (
    <tr className="pinnable">
      <td data-label="Data">{r.label}</td>
      <td data-label="Class"><span className={`chip ${tone}`}>{cls}</span></td>
      <td data-label="Kept for"><Kept r={r} /></td>
      <td data-label="Starts">{startsLabel(r)}</td>
      <td data-label="Then">{r.action === "delete" ? "Delete" : "Anonymise"}</td>
      <td className="num"><AskButton label="Change" prompt={`Keep ${r.label}${entity ? ` for ${entity.name}` : ""} for `} pin={pin} tool="set_retention_period" name={`Ask to change how long ${r.label} is kept`} /><PinButton pin={pin} /></td>
    </tr>
  );
}

function Fixed({ x, kept, then, pin }: { x: Extra; kept: string; then: string; pin: { label: string; tool: string; args: Record<string, unknown> } }) {
  return (
    <tr className="pinnable">
      <td data-label="Data">{x.label}{x.ships && <small>Applies when {x.ships} is installed</small>}</td>
      <td data-label="Class"><span className="chip agent">{x.ships ? "Default" : "Append-only"}</span></td>
      <td data-label="Kept for">{kept}</td>
      <td data-label="Starts">{x.starts}</td>
      <td data-label="Then">{then}</td>
      <td className="num"><PinButton pin={pin} /></td>
    </tr>
  );
}

const RANK = ["pay", "health", "bank", "performance", "candidate", "personal"];
const order = (a: RuleView, b: RuleView) => Number(b.paused) - Number(a.paused) || Number(!!b.statutory) - Number(!!a.statutory) || RANK.indexOf(a.class) - RANK.indexOf(b.class);

export function RetentionTable({ rules, entity, entities, defaults, appendOnly }: Props) {
  return (
    <div className="scroll-x"><table className="tbl retention-rules">
      <caption className="sr">Retention by data class{entity ? ` for ${entity.name}` : ""} ({entities.length} entities)</caption>
      <thead><tr><th>Data</th><th>Class</th><th>Kept for</th><th>Starts</th><th>Then</th><th className="num"><span className="sr">Ask and pin</span></th></tr></thead>
      <tbody>
        {[...rules].sort(order).map((r) => <Row key={r.id} r={r} entity={entity} />)}
        {defaults.map((d) => <Fixed key={d.label} x={d} kept={periodLabel(d.period ?? "")} then="Delete" pin={{ label: d.label, tool: "get_retention_rule", args: { rule: d.label } }} />)}
        {appendOnly.map((a) => <Fixed key={a.label} x={a} kept="Append-only" then="Exported daily, write-once" pin={{ label: a.label, tool: "get_retention_rule", args: { rule: a.label } }} />)}
      </tbody>
    </table></div>
  );
}
