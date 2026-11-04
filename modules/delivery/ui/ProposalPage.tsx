import type { ReactNode } from "react";
import { can, type Viewer } from "@amax/auth";
import { facet, PinButton } from "@amax/ui";
import { projectHref, releaseHref } from "../contracts";
import { projectPin, proposalPin } from "../pins";
import { proposalDetail, type ProposalDetail } from "../server/proposal-detail";
import { AskButton } from "./AskButton";
import { COLOR, day, PhaseChip } from "./parts";
import { ProposalActions } from "./ProposalActions";

const h = (n: number) => `${Number(n.toFixed(2))} h`;

function Facts({ p }: { p: ProposalDetail }) {
  const made = p.source === "specclaw" ? `synced from ${p.sourceRef ?? "the repo"}` : "made by hand";
  return (
    <p className="lede">
      <span className="dot" style={{ background: COLOR[p.projectColor] }} /><a href={projectHref(p.project.key)}>{p.project.name}</a>
      {" · "}<PhaseChip phase={p.phase} />{p.withdrawn && <> <span className="chip warn">Withdrawn</span></>}
      {" · "}Owner {p.ownerName ?? "Unassigned"}{" · "}{made}{p.createdAt ? `, ${day(p.createdAt)}` : ""}{p.updatedAt ? `, updated ${day(p.updatedAt)}` : ""}
    </p>
  );
}

function TimeCard({ p, pin }: { p: ProposalDetail; pin: (l: string) => ReactNode }) {
  const pct = p.estimateHours ? Math.min(100, Math.round((p.hours / p.estimateHours) * 100)) : null;
  return (
    <div className="card pinnable proposal-time">
      <div className="card-head"><h2>Time</h2>{pin("time")}</div>
      <div className="big">{h(p.hours)} <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}>approved{p.estimateHours !== null ? `, of ${h(p.estimateHours)} estimated` : ", no estimate"}</span></div>
      {pct !== null && <div className="gbar" role="img" aria-label={`${pct}% of the estimate`}><i style={{ width: `${pct}%`, background: pct >= 100 ? "var(--amber)" : "var(--violet)" }} /></div>}
      <p className="muted" style={{ fontSize: 13 }}>From approved timesheet entries logged against {p.key}.</p>
    </div>
  );
}

function ReleaseCard({ p, pin }: { p: ProposalDetail; pin: (l: string) => ReactNode }) {
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>Release</h2>{pin("release")}</div>
      {p.release ? <>
        <p><a href={releaseHref({ projectKey: p.project.key, version: p.release })}><b>{p.release}</b></a>{p.phase === "released" ? <> · <span className="chip good">In Prod{p.releasedAt ? ` since ${day(p.releasedAt)}` : ""}</span></> : p.shippedTo ? <> · furthest: <span className="chip">{p.shippedTo}</span></> : " · not deployed yet"}</p>
        <ul aria-label="Environments" className="row" style={{ listStyle: "none", padding: 0, gap: 8, flexWrap: "wrap" }}>
          {p.stages.map((s) => <li key={s.environment}><span className={`chip ${s.status === "deployed" ? "good" : s.status === "rolled-back" ? "bad" : s.status ? "info" : ""}`}>{s.environment}{s.isProd ? " (Prod)" : ""}: {s.status ?? "–"}{s.at ? `, ${day(s.at)}` : ""}</span></li>)}
        </ul>
      </> : <p className="muted">Not in a release yet. Released means a release that contains it reached Prod.</p>}
    </div>
  );
}

function Tasks({ p, pin }: { p: ProposalDetail; pin: (l: string) => ReactNode }) {
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Tasks</h2>{pin("tasks")}<span className="muted" style={{ fontSize: 13 }}>{p.tasksDone} of {p.tasksTotal} done</span></div>
      <table className="tbl"><caption className="sr">Tasks</caption><tbody>
        {p.tasks.length === 0 && <tr><td className="muted">No tasks yet.</td></tr>}
        {p.tasks.map((t) => <tr key={t.ref}><td><b>{t.ref}</b> {t.title}</td><td>{t.done ? <span className="chip good">Done{t.doneAt ? `, ${day(t.doneAt)}` : ""}</span> : <span className="muted">Open</span>}</td></tr>)}
      </tbody></table>
    </div>
  );
}

function History({ p, pin }: { p: ProposalDetail; pin: (l: string) => ReactNode }) {
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>History</h2>{pin("history")}</div>
      <table className="tbl"><caption className="sr">History</caption><tbody>
        {p.history.length === 0 && <tr><td className="muted">Nothing recorded yet.</td></tr>}
        {p.history.map((e, i) => <tr key={`${e.at}-${i}`}><td>{day(e.at)}</td><td>{e.text}</td><td>{e.by}</td></tr>)}
      </tbody></table>
    </div>
  );
}

/**
 * 081 AC-24 (FR-10a): what can happen to a hand-made proposal's key. A spec change synced into the project takes its
 * number, so a hand-made CON-019 moves to the hand-made series (CON-H001); the proposal itself, by id, keeps everything.
 */
export function KeyNote({ p }: { p: { key: string; source: string | null; project: { key: string } } }) {
  if (p.source !== null) return null;
  const hand = /-H\d+$/.test(p.key);
  return (
    <p className="muted keynote" role="note">
      {hand
        ? <>Made by hand, in the hand-made series ({p.project.key}-H…), so a specclaw change synced into {p.project.key} can't take this key.</>
        : <>Made by hand. If {p.project.key} starts syncing specclaw changes and one of them is numbered like {p.key}, this proposal moves to the hand-made series (for example {p.project.key}-H001). Its tasks, time, release and history move with it; links by the old key stop working.</>}
    </p>
  );
}

/** 081 AC-6: one proposal. Writes happen in chat, from the Ask amax buttons. */
export async function ProposalPage({ viewer, proposalKey }: { viewer: Viewer; proposalKey: string }) {
  const p = await proposalDetail(viewer, { key: proposalKey });
  if (!p) return <><nav className="crumb" aria-label="Breadcrumb"><a href="/delivery/proposals">Proposals</a></nav><h1>Proposal not found</h1><p className="lede">No proposal with the key {proposalKey}.</p></>;
  const ref = proposalPin(p);
  const pin = (label: string) => <PinButton inline pin={facet(ref, ` ${label}`)} />;
  const may = (perm: string) => can(viewer, perm, { projectId: p.project.id });
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><a href="/delivery/proposals">Proposals</a><span>/</span><a href={projectHref(p.project.key, "proposals")}>{p.project.name}</a><span>/</span>{p.key}</nav>
      <div className="row head">
        <div className="pinnable"><h1>{p.key} {p.title}<PinButton inline pin={ref} /></h1><Facts p={p} /></div>
        <div className="actions">
          <ProposalActions p={p} may={may} />
          <AskButton spark label="Ask amax" prompt={`About ${p.key} ${p.title}: `} pin={ref} />
          <PinButton inline pin={projectPin(p.project)} />
        </div>
      </div>
      <KeyNote p={p} />
      {p.withdrawn && <div className="card" role="status" style={{ marginBottom: 28 }}><p><b>Withdrawn.</b> {p.withdrawReason ?? "Its spec change was removed from the repo."} It no longer counts in lists, boards or releases.</p></div>}
      <div className="cols even" style={{ marginBottom: 28 }}><TimeCard p={p} pin={pin} /><ReleaseCard p={p} pin={pin} /></div>
      <div className="card pinnable" style={{ marginBottom: 28 }}>
        <div className="card-head"><h2>Description</h2>{pin("description")}</div>
        {p.description ? <p style={{ whiteSpace: "pre-wrap" }}>{p.description}</p> : <p className="muted">{p.source === "specclaw" ? "The spec lives in the repo." : "No description yet."}</p>}
        {(p.meta as { pr?: string | null }).pr && <p><a href={(p.meta as { pr: string }).pr} rel="noreferrer">Pull request {(p.meta as { pr: string }).pr.split("/").at(-1)}</a></p>}
      </div>
      <div className="cols even"><Tasks p={p} pin={pin} /><History p={p} pin={pin} /></div>
    </>
  );
}
