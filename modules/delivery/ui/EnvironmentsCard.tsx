import { environmentAction } from "../actions";
import type { EnvironmentRow } from "../server/queries";

// 042: a project's environments in order. Prod is optional; renaming keeps history.
export function EnvironmentsCard({ projectKey, envs, canEdit }: { projectKey: string; envs: EnvironmentRow[]; canEdit: boolean }) {
  const hidden = (name: string, position?: number) => (
    <><input type="hidden" name="projectKey" value={projectKey} /><input type="hidden" name="name" value={name} />{position !== undefined && <input type="hidden" name="position" value={position} />}</>
  );
  return (
    <div className="card flush" style={{ marginTop: 28 }}>
      <div className="card-head"><h2>Environments</h2><span className="muted" style={{ fontSize: 13 }}>{envs.find((e) => e.isProd) ? `Released means it reached ${envs.find((e) => e.isProd)!.name}` : "No Prod: nothing counts as released"}</span></div>
      <div className="scroll-x"><table className="tbl">
        <caption className="sr">Environments</caption>
        <thead><tr><th>Order</th><th>Name</th><th>Prod</th><th className="num">Deployments</th>{canEdit && <th className="num"><span className="sr">Actions</span></th>}</tr></thead>
        <tbody>
          {envs.map((e, i) => (
            <tr key={e.name}>
              <td data-label="Order">{e.position}</td>
              <td data-label="Name">{canEdit ? (
                <form action={environmentAction} style={{ display: "flex", gap: 6 }}>{hidden(e.name)}<input type="hidden" name="op" value="rename" />
                  <label className="sr" htmlFor={`env-${e.name}`}>Rename {e.name}</label><input id={`env-${e.name}`} className="select" name="rename" defaultValue={e.name} style={{ width: 140 }} /><button className="btn sm" type="submit">Rename</button></form>
              ) : <b>{e.name}</b>}</td>
              <td data-label="Prod">{canEdit ? (
                <form action={environmentAction}>{hidden(e.name)}<input type="hidden" name="op" value="prod" /><input type="hidden" name="isProd" value={String(e.isProd)} />
                  <button className={`btn sm${e.isProd ? " primary" : ""}`} type="submit" aria-pressed={e.isProd} aria-label={`${e.name} is ${e.isProd ? "" : "not "}Prod`}>{e.isProd ? "Prod" : "Make Prod"}</button></form>
              ) : e.isProd ? <span className="chip good">Prod</span> : <span className="muted">–</span>}</td>
              <td data-label="Deployments" className="num">{e.deployments}</td>
              {canEdit && (
                <td className="num" style={{ whiteSpace: "nowrap" }}>
                  <form action={environmentAction} style={{ display: "inline" }}>{hidden(e.name, e.position)}<button className="btn sm" name="op" value="up" type="submit" disabled={i === 0} aria-label={`Move ${e.name} earlier`}>↑</button></form>{" "}
                  <form action={environmentAction} style={{ display: "inline" }}>{hidden(e.name, e.position)}<button className="btn sm" name="op" value="down" type="submit" disabled={i === envs.length - 1} aria-label={`Move ${e.name} later`}>↓</button></form>{" "}
                  <form action={environmentAction} style={{ display: "inline" }}>{hidden(e.name)}<button className="btn sm" name="op" value="remove" type="submit" disabled={e.deployments > 0} aria-label={`Remove ${e.name}`}>Remove</button></form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table></div>
      {canEdit && (
        <form action={environmentAction} style={{ display: "flex", gap: 8, padding: "0 28px 24px" }}>
          <input type="hidden" name="projectKey" value={projectKey} /><input type="hidden" name="op" value="add" />
          <label className="sr" htmlFor="env-new">New environment</label><input id="env-new" className="select" name="name" placeholder="e.g. Staging" required style={{ width: 180 }} />
          <button className="btn sm" type="submit">Add environment</button>
        </form>
      )}
    </div>
  );
}
