import { isMasked } from "@amax/auth";
import { facet, Masked, PinButton } from "@amax/ui";
import { personPin } from "../pins";
import type { Employment } from "../contracts";
import { monthYear, shortDate } from "./parts";
import { Reveal } from "./Reveal";

const CONTRACT: Record<string, string> = { permanent: "Permanent", "fixed-term": "Fixed term", contractor: "Contractor", intern: "Intern" };
const last4 = (s: string) => `•••• ${s.replace(/\D/g, "").slice(-4)}`;
const hidden = (v: unknown): v is { masked: true } => isMasked(v);

export function EmploymentCard({ e, probationEnds, person }: { e: Employment | null; probationEnds: string | null; person: { id: string; name: string } }) {
  const pin = <PinButton pin={facet(personPin(person), ", employment")} />;
  if (!e) return <div className="card pinnable" id="employment">{pin}<h2>Employment</h2><p className="muted">No employment record yet.</p></div>;
  const hours = e.fte >= 1 ? "full time" : `part time, ${Math.round(e.fte * 100)}%`;
  return (
    <div className="card pinnable" id="employment">
      {pin}
      <h2>Employment</h2>
      <dl className="kv" style={{ marginTop: 18 }}>
        <dt>Contract</dt><dd>{CONTRACT[e.contract]}, {hours}{e.contractEndsOn ? `, ends ${shortDate(e.contractEndsOn)}` : ""}</dd>
        <dt>Grade</dt><dd>{e.grade ?? "–"}</dd>
        <dt>Basic salary</dt>
        <dd>{hidden(e.baseSalary) ? <Masked masked /> : e.baseSalary === null ? "–" : <Reveal label="basic salary">{e.currency} {Number(e.baseSalary).toLocaleString("en-US")}</Reveal>}</dd>
        <dt>EPF number</dt><dd>{hidden(e.epfNumber) ? <Masked masked /> : e.epfNumber ? last4(e.epfNumber) : "–"}</dd>
        <dt>Bank</dt><dd>{hidden(e.bankAccount) || hidden(e.bankName) ? <Masked masked /> : e.bankAccount ? `${e.bankName ?? ""} ${last4(e.bankAccount)}` : "–"}</dd>
        {probationEnds && <><dt>Probation ends</dt><dd>{shortDate(probationEnds)}</dd></>}
        <dt>Next review</dt><dd>{monthYear(e.nextReview)}</dd>
      </dl>
    </div>
  );
}
