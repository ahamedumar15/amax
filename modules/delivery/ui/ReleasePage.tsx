import { can } from "@amax/auth";
import type { ScreenProps } from "@amax/core";
import { PinButton } from "@amax/ui";
import { getProject, getRelease, listEnvironments } from "../server/queries";
import { AskButton } from "./AskButton";
import { day, needViewer, PhaseChip, SignInFirst } from "./parts";

export async function ReleasePage({ viewer: raw, params }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Release</h1><SignInFirst /></>;
  const [release, envs, project] = await Promise.all([getRelease(viewer, params.projectKey, params.version), listEnvironments(viewer, params.projectKey), getProject(viewer, params.projectKey)]);
  if (!release || !project) return <><h1>Release not found</h1></>;
  const canEdit = can(viewer, "delivery:release:create", { projectId: project.project.id });
  const canDeploy = can(viewer, "delivery:deployment:record", { projectId: project.project.id });
  const name = `${release.projectKey} ${release.version}`;
  const ref = { label: name, tool: "get_release_history", args: { projectKey: release.projectKey, version: release.version } };
  const deployPin = (d: { id: string; environment: string; at: string }) =>
    ({ label: `${name} on ${d.environment}, ${day(d.at)}`, tool: "get_deployment", args: { projectKey: release.projectKey, version: release.version, deploymentId: d.id } });
  const pin = (label: string) => <PinButton inline pin={{ ...ref, label: `${name} ${label}` }} />;
  const included = release.proposals.filter((p) => p.included);
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><a href="/delivery/releases">Releases</a><span>/</span><a href={`/delivery/p/${release.projectKey}`}>{release.projectName}</a><span>/</span>{release.version}</nav>
      <div className="row head"><div><h1>{release.projectName} {release.version}</h1><p className="lede">{included.length} proposals. Released means it reached {envs.find((e) => e.isProd)?.name ?? "a Prod environment (this project has none)"}. Changes happen in chat.</p></div></div>
      <div className="cols even" style={{ marginBottom: 28 }}>
        <div className="card pinnable">
          <div className="card-head"><h2>Tag and proposals</h2>{pin("proposals")}</div>
          <ul aria-label="Proposals in this release" style={{ listStyle: "none", padding: 0, display: "grid", gap: 6, margin: "14px 0", maxHeight: 280, overflow: "auto" }}>
            {included.map((p) => <li key={p.key} className="pinnable"><b>{p.key}</b> {p.title} <PhaseChip phase={p.phase} /><PinButton pin={{ label: `${p.key} ${p.title}`, tool: "get_proposal", args: { key: p.key } }} /></li>)}
            {included.length === 0 && <li className="muted">No proposals yet.</li>}
          </ul>
          {canEdit && <div className="actions">
            <AskButton spark label="Ask amax to re-tag" prompt={`Tag ${name} as `} pin={ref} />
            <AskButton spark label="Ask amax to change the proposals" prompt={`Set the proposals in ${name} to: ${included.map((p) => p.key).join(", ")}`} pin={ref} />
          </div>}
        </div>
        <div className="card pinnable">
          <div className="card-head"><h2>Record a deployment</h2>{pin("deployments")}</div>
          <p className="muted">Environments, in order: {envs.map((e) => `${e.name}${e.isProd ? " (Prod)" : ""}`).join(", ") || "none yet"}. Pipelines record deployments; record or void one by asking in chat.</p>
          {canDeploy && <AskButton spark className="btn sm primary" label="Ask amax to record a deployment" prompt={`Record a deployment of ${name} to `} pin={ref} />}
        </div>
      </div>
      <div className="card flush pinnable">
        <div className="card-head"><h2>Deployment history</h2>{pin("deployment history")}</div>
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Deployment history</caption>
          <thead><tr><th>When</th><th>Environment</th><th>Status</th><th>Recorded by</th><th>Note</th><th className="num"><span className="sr">Actions</span></th></tr></thead>
          <tbody>
            {release.history.length === 0 && <tr><td colSpan={6} className="muted">Not deployed yet.</td></tr>}
            {release.history.map((d) => (
              <tr key={d.id} className="pinnable">
                <td data-label="When">{day(d.at)}</td><td data-label="Environment">{d.environment}</td>
                <td data-label="Status">{d.voidedAt ? <span className="chip">Voided: {d.voidReason}</span> : <span className={`chip ${d.status === "rolled-back" ? "bad" : d.status === "testing" ? "info" : "good"}`}>{d.status}</span>}</td>
                <td data-label="Recorded by">{d.recordedBy}</td><td data-label="Note">{d.note ?? (d.run ? `Run ${d.run}` : "–")}</td>
                <td className="num">{canDeploy && !d.voidedAt && <AskButton label="Void" name={`Void the ${d.environment} deployment of ${day(d.at)}`} pin={deployPin(d)}
                  prompt={`Void the ${d.environment} deployment of ${name} (id ${d.id}). Reason: `} />}<PinButton pin={deployPin(d)} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </>
  );
}
