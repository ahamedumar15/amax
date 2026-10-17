import { isMasked } from "@amax/auth";
import type { DocumentRow } from "../server/queries";
import { shortDate, longDate } from "./parts";

const STATUS: Record<string, [string, string, string]> = {
  signed: ["good", "Signed", "Signed"], received: ["good", "Received", "Received"], requested: ["warn", "Requested", "Requested"], missing: ["warn", "Missing", "Requested"],
};
const DocIcon = ({ warn }: { warn: boolean }) => (
  <span className="icon-dot" style={warn ? { background: "#FFF1D6", color: "#9A5B00" } : { background: "var(--violet-soft)", color: "var(--violet)" }} aria-hidden="true">
    <svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /></svg>
  </span>
);

export function DocumentsCard({ docs }: { docs: DocumentRow[] }) {
  return (
    <div className="card" id="documents">
      <h2>Documents</h2>
      {docs.length === 0 ? <p className="muted">No documents yet.</p> : (
        <ul className="list" style={{ marginTop: 14 }}>
          {docs.map((d) => {
            const [tone, chip, verb] = STATUS[d.status];
            const masked = isMasked(d.title);
            return (
              <li key={d.id}>
                <div className="l"><DocIcon warn={tone === "warn"} />
                  <div>{masked ? <span title="Hidden for your role">Restricted document ({d.class})</span> : (d.title as string)}<small>{verb} {d.status === "signed" ? longDate(d.datedOn) : shortDate(d.datedOn)}</small></div>
                </div>
                <span className={`chip ${tone}`}>{chip}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
