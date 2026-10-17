import { PinButton } from "@amax/ui";
import type { EnvironmentRow } from "../server/queries";
import { AskButton } from "./AskButton";

const envPin = (projectKey: string, name: string) => ({ label: `${projectKey} ${name}`, tool: "get_environment", args: { projectKey, name } });

function RowAsks({ projectKey, e, pin }: { projectKey: string; e: EnvironmentRow; pin: { label: string; tool: string; args: Record<string, unknown> } }) {
  const of = `the ${e.name} environment of ${projectKey}`;
  return (
    <>
      <AskButton label="Rename" name={`Rename ${e.name}`} prompt={`Rename ${of} to `} pin={pin} />{" "}
      <AskButton label="Move" name={`Move ${e.name}`} prompt={`Move ${of} to position `} pin={pin} />{" "}
      <AskButton label={e.isProd ? "Unmark Prod" : "Make Prod"} name={`${e.isProd ? "Unmark Prod" : "Make Prod"}: ${e.name}`}
        prompt={e.isProd ? `Unmark ${e.name} as the Prod environment of ${projectKey}` : `Make ${e.name} the Prod environment of ${projectKey}`} pin={pin} />{" "}
      <AskButton label="Remove" name={`Remove ${e.name}`} disabled={e.deployments > 0} prompt={`Remove ${of}`} pin={pin} />
    </>
  );
}

export function EnvironmentsCard({ projectKey, envs, canEdit }: { projectKey: string; envs: EnvironmentRow[]; canEdit: boolean }) {
  const pin = { label: `${projectKey} environments`, tool: "list_environments", args: { projectKey } };
  const prod = envs.find((e) => e.isProd);
  return (
    <div className="card flush pinnable" style={{ marginTop: 28 }}>
      <div className="card-head"><h2>Environments</h2><PinButton inline pin={pin} /><span className="muted" style={{ fontSize: 13 }}>{prod ? `Released means it reached ${prod.name}` : "No Prod: nothing counts as released"}</span>
        {canEdit && <div className="actions"><AskButton spark label="Ask amax to add an environment" prompt={`Add an environment to ${projectKey}: `} pin={pin} /></div>}</div>
      <div className="scroll-x"><table className="tbl">
        <caption className="sr">Environments</caption>
        <thead><tr><th>Order</th><th>Name</th><th>Prod</th><th className="num">Deployments</th><th className="num"><span className="sr">Actions</span></th></tr></thead>
        <tbody>
          {envs.map((e) => (
            <tr key={e.name} className="pinnable">
              <td data-label="Order">{e.position}</td>
              <td data-label="Name"><b>{e.name}</b></td>
              <td data-label="Prod">{e.isProd ? <span className="chip good">Prod</span> : <span className="muted">–</span>}</td>
              <td data-label="Deployments" className="num">{e.deployments}</td>
              <td className="num" style={{ whiteSpace: "nowrap" }}>{canEdit && <RowAsks projectKey={projectKey} e={e} pin={envPin(projectKey, e.name)} />}<PinButton pin={envPin(projectKey, e.name)} /></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
