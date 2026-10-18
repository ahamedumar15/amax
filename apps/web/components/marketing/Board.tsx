const ROWS = [
  ["AMX-142 closed by commit", "Contoso Portal", "Liam Walsh", "09:12", "v2", "Done"],
  ["2.5 h drafted, Wed", "Contoso Portal", "Liam Walsh", "09:12", "v3", "To accept"],
  ["Week 2026-W42 submitted", "32.5 h", "Liam Walsh", "16:40", "v1", "To approve"],
  ["Fleet Tracker v1.9.0 to Prod", "3 proposals", "Jack O'Brien", "17:05", "v4", "Promoted"],
  ["Invoice drafted, milestone 3", "Contoso Portal", "Priya Raman", "17:06", "v3", "To issue"],
  ["Leave requested, 3 days", "Nov 3–5", "Sophie Nguyen", "17:30", "v5", "To approve"],
];
const OPEN = 3;

export function Board() {
  return (
    <section className="m2board" aria-labelledby="board-title">
      <div className="wrap">
        <h2 id="board-title">Today at Lumen Labs (fictional)</h2>
        <ul className="brows" data-ui>
          {ROWS.map(([name, a, who, at, tone, status], i) => (
            <li key={name} className={i === OPEN ? "brow open" : "brow"}>
              <span className="n">{name}</span><span className="f">{a}</span><span className="f">{who}</span><span className="f">{at}</span><span className={`st ${tone}`}>{status}</span>
              {i === OPEN && <span className="detail">Recorded by the CI pipeline for Jack O&apos;Brien, promoted by Chloe Harris in chat. The release closes CON-012 and CON-014, and its audit entry is chained.</span>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
