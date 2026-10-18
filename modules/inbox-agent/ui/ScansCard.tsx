import { EmptyState, PinButton } from "@amax/ui";
import { scanPin, viewPin } from "../pins";
import type { ScanRow } from "../server/rows";
import { SCAN_CHIP, stamp } from "./parts";

export function ScansCard({ scans }: { scans: ScanRow[] }) {
  return (
    <div className="card flush pinnable section">
      <div className="card-head"><h2>Recent scans</h2><PinButton inline pin={viewPin("Recent Teams and email scans")} /><span className="muted small">Started by the inbox-agent.scan job</span></div>
      {scans.length === 0 ? <EmptyState icon="clock" title="No scans yet" hint="The first scan runs within the hour after consent is recorded and a source is allowed." /> : (
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Recent Teams and email scans</caption>
          <thead><tr><th>Started</th><th>Result</th><th className="num">Messages</th><th className="num">Suggested</th></tr></thead>
          <tbody>
            {scans.map((s) => {
              const [tone, label] = SCAN_CHIP[s.status];
              return (
                <tr key={s.id} className="pinnable">
                  <td data-label="Started">{stamp(s.startedAt)}</td>
                  <td data-label="Result"><span className={`chip ${tone}`}>{label}</span>{s.failure && <> {s.failure}</>}</td>
                  <td className="num" data-label="Messages">{s.messages}</td>
                  <td className="num" data-label="Suggested">{s.suggested}<PinButton pin={scanPin(s)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
