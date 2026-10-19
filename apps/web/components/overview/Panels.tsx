import Link from "next/link";
import type { OverviewPanel } from "@amax/core";
import { Icon, PinButton } from "@amax/ui";
import { SeriesChart } from "./SeriesChart";
import { ShareDonut } from "./ShareDonut";

type Of<K extends OverviewPanel["kind"]> = Extract<OverviewPanel, { kind: K }>;

const TONE = { good: ["var(--mint-soft)", "#14845A", "chart"], attention: ["#FDF3D0", "#8A6A00", "bell"], problem: ["#FDE7E4", "#C2412F", "target"], info: ["var(--violet-soft)", "var(--violet)", "spark"] } as const;

function ListPanel({ panel }: { panel: Of<"list"> }) {
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>{panel.title}</h2><PinButton inline pin={panel.pin} /></div>
      {panel.items.length ? <ul className="list">{panel.items.map((i) => (
        <li key={i.id} className="pinnable"><div className="l"><span className="icon-dot" aria-hidden="true" style={{ background: TONE[i.tone][0], color: TONE[i.tone][1] }}><Icon name={TONE[i.tone][2]} /></span><div>{i.title}<small>{i.detail}</small></div></div><PinButton pin={i.pin} /></li>
      ))}</ul> : <p className="muted empty-line">Nothing new.</p>}
      <Link className="btn block" href={panel.href}>{panel.hrefLabel}</Link>
    </div>
  );
}

function MetricPanel({ panel }: { panel: Of<"metric"> }) {
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>{panel.title}</h2><PinButton inline pin={panel.pin} /></div>
      {panel.person && <div className="person"><span className="av lg" aria-hidden="true">{panel.person.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2)}</span><div><small>Top contributor this month</small><b>{panel.person.name}</b><small>{panel.person.note}</small></div></div>}
      <div className="row metric-row"><span className="muted">{panel.label}</span>{panel.change !== null && <span className={panel.change >= 0 ? "up" : "down"}>{panel.change >= 0 ? "↑" : "↓"} {Math.abs(panel.change)}% vs last month</span>}</div>
      <div className="big">{panel.value}</div>
    </div>
  );
}

function ProgressPanel({ panel }: { panel: Of<"progress"> }) {
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>{panel.title}</h2><PinButton inline pin={panel.pin} /></div>
      {panel.items.length ? <div className="split">{panel.items.map((i) => (
        <div key={i.id} className="pinnable"><div className="k">{i.label} <PinButton pin={i.pin} /></div><div className="big">{i.done} of {i.total}</div>
          <div className="gbar" role="img" aria-label={`${i.label}: ${i.done} of ${i.total} environments passed`}><i className={i.problem ? "problem" : "good"} style={{ width: `${i.total ? (i.done / i.total) * 100 : 0}%` }} /></div>
          <small className="muted gnote">{i.note}</small></div>
      ))}</div> : <p className="muted empty-line">No open releases.</p>}
    </div>
  );
}

/** 068: one Overview panel, drawn by its kind; the page never knows which module sent it. */
export function Panel({ panel }: { panel: OverviewPanel }) {
  switch (panel.kind) {
    case "series": return <SeriesChart panel={panel} />;
    case "share": return <ShareDonut panel={panel} />;
    case "metric": return <MetricPanel panel={panel} />;
    case "progress": return <ProgressPanel panel={panel} />;
    case "list": return <ListPanel panel={panel} />;
  }
}
