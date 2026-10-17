import type { ScreenProps } from "@amax/core";
import { canEver, type Viewer } from "@amax/auth";
import { Card, EmptyState, IntentButton, PinButton } from "@amax/ui";
import { forecastFor } from "../server/forecast";
import { gridFor, headlines } from "../server/grid";
import { monthLabel } from "../server/months";
import { Donut, LineChart } from "./charts";
import { CopyMonth } from "./CopyMonth";
import { Grid } from "./Grid";
import "./allocations.css";

const SKILL_COLOR: Record<string, string> = { ".NET": "#7B61FF", React: "#5CC8F0", QA: "#F48B9B", Data: "#F2A93B", Mobile: "#2FCB8C", Delivery: "#B3A1FF" };
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] ?? "");

function lede({ over, idle }: ReturnType<typeof headlines>) {
  const parts = [
    ...over.map((o) => `${o.name.split(" ")[0]} is over-allocated in ${monthLabel(o.month, "long")}.`),
    ...idle.map((o) => `${o.name.split(" ")[0]} has no work planned from ${monthLabel(o.month, "long")}.`),
  ];
  return parts.join(" ") || "Nobody is over-allocated, and everyone has work planned.";
}

export async function AllocationsPage({ params, viewer: raw }: ScreenProps) {
  const viewer = raw as Viewer | null;
  if (!viewer) return <><h1>Allocations and forecast</h1><Card><EmptyState icon="people" title="Sign in to see allocations" hint="Capacity, demand and the monthly plan come from the database once you're signed in." /></Card></>;
  const everyone = params.view === "everyone";
  const [f, grid] = await Promise.all([forecastFor(viewer), gridFor(viewer, { everyone })]);
  const benchMonth = f.months.find((m) => m.forecast) ?? f.months[f.months.length - 1];
  const bySkill = Object.entries(benchMonth.bench.reduce<Record<string, number>>((n, b) => ({ ...n, [b.skill]: (n[b.skill] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const span = `${monthLabel(f.months[0].month)} to ${monthLabel(f.months[f.months.length - 1].month)}`;
  return (
    <>
      <div className="row head alloc">
        <div><h1>Allocations and forecast</h1><p className="lede">{lede(headlines(grid))}</p></div>
        {canEver(viewer, "allocations:allocate") && <div className="actions"><IntentButton intent="allocations.allocate" label="Allocate" primary={false} /></div>}
      </div>
      <div className="cols even" style={{ marginBottom: 28 }}>
        <div className="card pinnable">
          <div className="card-head"><h2>Capacity and demand</h2><PinButton inline pin={{ label: "Capacity and demand", tool: "get_capacity_forecast", args: {} }} /><span className="muted" style={{ fontSize: 13 }}>{f.team}, {span}</span></div>
          <LineChart id="capdem" label="Capacity against demand" labels={f.months.map((m) => monthLabel(m.month))} min={130} max={150} step={5}
            series={[{ name: "Capacity", color: "#2FCB8C", dashed: true, data: f.months.map((m) => m.capacity) }, { name: "Demand", color: "#7B61FF", area: true, data: f.months.map((m) => m.demand) }]} />
          <div className="legend"><span><i style={{ background: "var(--violet)" }} />Demand</span><span><i className="dash" />Capacity</span></div>
          {!f.leaveAdjusted && <p className="muted note">Booked leave isn&apos;t subtracted until the Leave module is installed.</p>}
        </div>
        <div className="card pinnable">
          <div className="card-head"><h2>Bench by skill, {monthLabel(benchMonth.month, "long")}</h2><PinButton inline pin={{ label: `Bench by skill, ${monthLabel(benchMonth.month, "long")}`, tool: "get_capacity_forecast", args: {} }} /><span className="muted" style={{ fontSize: 13 }}>{benchMonth.bench.length} {benchMonth.bench.length === 1 ? "person" : "people"}</span></div>
          <Donut label={`Bench by skill, ${monthLabel(benchMonth.month, "long")}`} center={String(benchMonth.bench.length)} sub="on bench"
            parts={bySkill.map(([name, value]) => ({ name, value, color: SKILL_COLOR[name] ?? "#C3B5FF" }))} />
        </div>
      </div>
      <div className="card flush pinnable">
        <div className="card-head">
          <h2>People by month</h2><PinButton inline pin={{ label: "People by month", tool: "list_allocations", args: { everyone } }} />
          <div className="actions">
            <span className="chip">{f.team}</span>
            <a className="btn" href={everyone ? "/allocations" : "/allocations/everyone"}>{everyone ? "My projects" : "Everyone"}</a>
            {canEver(viewer, "allocations:copy") && <CopyMonth months={grid.months.slice(0, -1).map((m) => m.month)} team={f.team} />}
          </div>
        </div>
        {grid.people.length ? <Grid grid={grid} everyone={everyone} />
          : grid.hidden ? <EmptyState icon="people" title="No one you can see here" hint={`${grid.hidden} ${grid.hidden === 1 ? "person is" : "people are"} outside your HR access.`} />
          : <EmptyState icon="people" title="No allocations yet" hint="Use Allocate to plan people onto projects by month." />}
        {grid.people.length > 0 && grid.hidden > 0 && <p className="muted" style={{ fontSize: 13 }}>{grid.hidden} more {grid.hidden === 1 ? "person is" : "people are"} outside your HR access and not shown.</p>}
      </div>
    </>
  );
}

export const AllocationsEveryonePage = (props: ScreenProps) => AllocationsPage({ ...props, params: { ...props.params, view: "everyone" } });
