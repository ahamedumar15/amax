import { can } from "@amax/auth";
import type { ScreenProps } from "@amax/core";
import { PinButton } from "@amax/ui";
import { deployAction, releaseEditAction, voidAction } from "../actions";
import { getProject, getRelease, listEnvironments } from "../server/queries";
import { day, needViewer, PhaseChip, SignInFirst } from "./parts";

// 042: one release — its tag and proposals, deploy to any environment, history with Void.
export async function ReleasePage({ viewer: raw, params }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Release</h1><SignInFirst /></>;
  const [release, envs, project] = await Promise.all([getRelease(viewer, params.projectKey, params.version), listEnvironments(viewer, params.projectKey), getProject(viewer, params.projectKey)]);
  if (!release || !project) return <><h1>Release not found</h1></>;
  const canEdit = can(viewer, "delivery:release:create", { projectId: project.project.id });
  const canDeploy = can(viewer, "delivery:deployment:record", { projectId: project.project.id });
  const pin = (label: string) => <PinButton inline pin={{ label: `${release.projectKey} ${release.version} ${label}`, tool: "get_release_history", args: { projectKey: release.projectKey, version: release.version } }} />;
  const hid = <><input type="hidden" name="projectKey" value={release.projectKey} /><input type="hidden" name="version" value={release.version} /></>;
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><a href="/delivery/releases">Releases</a><span>/</span><a href={`/delivery/p/${release.projectKey}`}>{release.projectName}</a><span>/</span>{release.version}</nav>
      <div className="row head"><div><h1>{release.projectName} {release.version}</h1><p className="lede">{release.proposals.filter((p) => p.included).length} proposals. Released means it reached {envs.find((e) => e.isProd)?.name ?? "a Prod environment (this project has none)"}.</p></div></div>
      <div className="cols even" style={{ marginBottom: 28 }}>
        <form className="card pinnable" action={releaseEditAction} aria-labelledby="rel-edit">
          <div className="card-head"><h2 id="rel-edit">Tag and proposals</h2>{pin("proposals")}</div>
          {hid}
          <label>Version tag <input className="select" name="newVersion" defaultValue={release.version} disabled={!canEdit} /></label>
          <fieldset style={{ border: 0, padding: 0, margin: "14px 0", display: "grid", gap: 6, maxHeight: 280, overflow: "auto" }}>
            <legend className="muted">Proposals in this release</legend>
            {release.proposals.map((p) => (
              <label key={p.key} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" name="proposal" value={p.key} defaultChecked={p.included} disabled={!canEdit || p.phase === "released"} /> <b>{p.key}</b> {p.title} <PhaseChip phase={p.phase} />
              </label>
            ))}
          </fieldset>
          {canEdit && <button className="btn primary" type="submit">Save release</button>}
        </form>
        <form className="card pinnable" action={deployAction} aria-labelledby="rel-deploy">
          <div className="card-head"><h2 id="rel-deploy">Record a deployment</h2>{pin("deployments")}</div>
          {hid}
          <label>Environment <select className="select" name="environment" disabled={!canDeploy}>{envs.map((e) => <option key={e.name} value={e.name}>{e.name}{e.isProd ? " (Prod)" : ""}</option>)}</select></label>
          <label style={{ display: "block", marginTop: 10 }}>Status <select className="select" name="status" disabled={!canDeploy}><option value="deployed">Deployed</option><option value="testing">Testing</option><option value="rolled-back">Rolled back</option></select></label>
          <label style={{ display: "block", marginTop: 10 }}>Note <input className="select" name="note" placeholder="Optional, e.g. pipeline run 1191" disabled={!canDeploy} /></label>
          {canDeploy && <button className="btn primary" type="submit" style={{ marginTop: 14 }}>Record deployment</button>}
        </form>
      </div>
      <div className="card flush pinnable">
        <div className="card-head"><h2>Deployment history</h2>{pin("deployment history")}</div>
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Deployment history</caption>
          <thead><tr><th>When</th><th>Environment</th><th>Status</th><th>Recorded by</th><th>Note</th><th className="num"><span className="sr">Actions</span></th></tr></thead>
          <tbody>
            {release.history.length === 0 && <tr><td colSpan={6} className="muted">Not deployed yet.</td></tr>}
            {release.history.map((d, i) => (
              <tr key={i} className="pinnable">
                <td data-label="When">{day(d.at)}</td><td data-label="Environment">{d.environment}</td>
                <td data-label="Status">{d.voidedAt ? <span className="chip">Voided: {d.voidReason}</span> : <span className={`chip ${d.status === "rolled-back" ? "bad" : d.status === "testing" ? "info" : "good"}`}>{d.status}</span>}</td>
                <td data-label="Recorded by">{d.recordedBy}</td><td data-label="Note">{d.note ?? (d.run ? `Run ${d.run}` : "–")}</td>
                <td className="num">{canDeploy && !d.voidedAt && (
                  <form action={voidAction} style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>{hid}<input type="hidden" name="environment" value={d.environment} /><input type="hidden" name="deploymentId" value={d.id} />
                    <label className="sr" htmlFor={`void-${i}`}>Reason to void the {d.environment} deployment</label><input id={`void-${i}`} className="select" name="reason" placeholder="Reason" required minLength={3} style={{ width: 160 }} />
                    <button className="btn sm" type="submit">Void</button></form>
                )}<PinButton pin={{ label: `${release.projectKey} ${release.version} on ${d.environment}, ${day(d.at)}`, tool: "get_release_history", args: { projectKey: release.projectKey, version: release.version } }} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </>
  );
}
