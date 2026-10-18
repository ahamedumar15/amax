import { EmptyState, PinButton } from "@amax/ui";
import type { Incident } from "../server/registers";
import { AskButton } from "./AskButton";
import { CLASS_LABEL, COUNTRY, shortDate } from "./parts";
import { decidePrompt } from "./prompts";

const rowPin = (i: Incident) => ({ label: `${i.ref} ${i.title}`, tool: "get_incident", args: { incidentId: i.id } });
const listPin = { label: "Incidents", tool: "get_compliance_overview", args: {} };
const STATUS: Record<string, [string, string]> = { reported: ["warn", "Reported"], assessing: ["warn", "Assessing"], contained: ["info", "Contained"], resolved: ["good", "Resolved"] };
const undecided = (i: Incident) => i.breach && !i.decision && i.status !== "resolved";

function Data({ i }: { i: Incident }) {
  if (!i.personalData) return <span className="chip good">{i.impact ? `None, ${i.impact}` : "None"}</span>;
  return <span className="chip pink">{CLASS_LABEL[i.dataClass ?? "personal"]}</span>;
}

function Due({ i }: { i: Incident }) {
  if (undecided(i)) return <><b>{shortDate(i.notifyBy!)}</b><small>{i.regulator} rule</small></>;
  if (i.decision) return <>{i.decision === "notify" ? "Notified" : "Not notifiable"}</>;
  return <>{i.status === "resolved" ? "Closed" : "No breach"}</>;
}

export function Incidents({ rows }: { rows: Incident[] }) {
  const open = rows.filter(undecided).length;
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Incidents</h2><PinButton inline pin={listPin} />{open > 0 ? <span className="chip warn">{open} possible {open === 1 ? "breach" : "breaches"}</span> : <span className="chip good">No breach decisions due</span>}</div>
      {rows.length === 0 ? <EmptyState icon="doc" title="No incidents" hint="Incidents anyone reports through chat show up here, with any breach deadline from the country pack." /> : (
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Incidents, with personal-data breach decisions due first</caption>
          <thead><tr><th>Incident</th><th>Owner</th><th>Personal data</th><th>Decision due</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} className="pinnable">
                <td data-label="Incident"><b>{i.title}</b><small>{shortDate(i.occurredOn)}{i.country ? `, ${COUNTRY[i.country] ?? i.country}` : ""}</small></td>
                <td data-label="Owner">{i.ownerName ?? "Unassigned"}</td>
                <td data-label="Personal data"><Data i={i} /></td>
                <td data-label="Decision due"><Due i={i} /></td>
                <td data-label="Status" className="act">
                  <span className={`chip ${STATUS[i.status][0]}`}>{STATUS[i.status][1]}</span>
                  {undecided(i) && <AskButton className="btn sm ghost" label="Decide" name={`Ask amax to decide on ${i.title}`} prompt={decidePrompt(i)} pin={rowPin(i)} />}
                  <PinButton pin={rowPin(i)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
