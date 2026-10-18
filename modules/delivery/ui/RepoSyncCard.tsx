import { PinButton } from "@amax/ui";
import { pushPin, repoSyncPin } from "../pins";
import type { PushRow } from "../server/repo-sync";
import { AskButton } from "./AskButton";

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
const result = (p: PushRow) => p.outcome === "refused" ? p.reason ?? "refused"
  : [`${p.created} created`, `${p.updated} updated`, `${p.unchanged} unchanged`, p.skipped.length ? `${p.skipped.length} skipped` : ""].filter(Boolean).join(" · ");

type Props = { projectKey: string; projectId: string; repoUrl: string | null; last: PushRow | null; recent: PushRow[]; canLink: boolean };

// 062 AC-10: refused pushes first, since they need someone to act; linking happens in chat.
export function RepoSyncCard({ projectKey, projectId, repoUrl, last, recent, canLink }: Props) {
  const pin = repoSyncPin({ id: projectId, key: projectKey });
  const rows = [...recent.filter((p) => p.outcome === "refused"), ...recent.filter((p) => p.outcome === "applied")].slice(0, 8);
  const refused = recent.filter((p) => p.outcome === "refused").length;
  return (
    <div className="card flush pinnable" style={{ marginTop: 28 }}>
      <div className="card-head"><h2>Repo sync</h2><PinButton inline pin={pin} />
        <span className="muted" style={{ fontSize: 13 }}>{repoUrl ? `From ${repoUrl}` : "No repo linked: specclaw pushes are refused"}</span>
        {canLink && <div className="actions"><AskButton spark label={repoUrl ? "Ask amax to change the linked repo" : "Ask amax to link a repo"}
          prompt={repoUrl ? `Change the repo ${projectKey} syncs from to ` : `Link ${projectKey} to the repo `} pin={pin} /></div>}</div>
      <p className="lede" style={{ padding: "0 20px" }}>
        {refused ? `${refused} recent ${refused === 1 ? "push was" : "pushes were"} refused. ` : ""}
        {last ? `Last sync ${when(last.at)} by ${last.by}: ${result(last)}.` : "No specclaw push applied yet."}
      </p>
      {rows.length > 0 && (
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Recent specclaw pushes</caption>
          <thead><tr><th>When</th><th>By</th><th>Commit</th><th>Result</th><th className="num"><span className="sr">Pin</span></th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="pinnable">
                <td data-label="When">{when(p.at)}</td>
                <td data-label="By">{p.by}</td>
                <td data-label="Commit"><code>{p.ref}@{p.sha.slice(0, 7)}</code></td>
                <td data-label="Result">{p.outcome === "refused" ? <span className="chip warn">Refused</span> : <span className="chip good">Applied</span>} {result(p)}</td>
                <td className="num"><PinButton pin={pushPin({ ...p, projectKey })} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
