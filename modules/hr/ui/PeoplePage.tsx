import { notFound } from "next/navigation";
import type { ScreenProps } from "@amax/core";
import { canEver } from "@amax/auth";
import { IntentButton, Ticket } from "@amax/ui";
import { listDirectory, listEntities } from "../server/queries";
import { peopleStats } from "../server/stats";
import { GBars, HBars } from "./charts";
import { Directory } from "./Directory";
import { EntityFilter } from "./EntityFilter";
import { countryName, needViewer, shortDate, SignInFirst } from "./parts";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const nextMonthName = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });

export async function PeoplePage({ params, viewer: raw }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>People</h1><SignInFirst /></>;
  const today = new Date();
  const entities = await listEntities(viewer);
  const entity = entities.find((e) => e.code === params.entity);
  if (params.entity && !entity) notFound();
  const all = params.all === "all";
  const [s, dir] = await Promise.all([peopleStats(viewer, today, entity?.id), listDirectory(viewer, { entityId: entity?.id, limit: all ? 1000 : 25 })]);
  const inEntities = s.byEntity.filter((e) => e.n > 0);
  const joined = s.joiners.reduce((a, b) => a + b, 0), left = s.leavers.reduce((a, b) => a + b, 0);
  const q = `Q${Math.floor(today.getUTCMonth() / 3) + 1}`;
  return (
    <>
      <div className="row head hr">
        <div>
          <h1>People</h1>
          <p className="lede">{plural(s.headcount, "person", "people")} in {plural(inEntities.length, "entity", "entities")}. {plural(s.probation.dueThisMonth, "probation review")} {s.probation.dueThisMonth === 1 ? "is" : "are"} due this month and {plural(s.contractsEndingNextMonth, "contract")} end{s.contractsEndingNextMonth === 1 ? "s" : ""} in {nextMonthName(today)}.</p>
        </div>
        <div className="actions">
          <EntityFilter entities={entities.map((e) => ({ code: e.code, label: countryName(e.country, e.name) }))} current={entity?.code} />
          {canEver(viewer, "hr:person:create") && <IntentButton intent="hr.add-person" label="Add person" />}
        </div>
      </div>
      <div className="tickets four">
        <Ticket tone="info" label="Headcount" value={String(s.headcount)} note={inEntities.map((e) => `${e.n} ${countryName(e.country, e.name)}`).join(", ")} />
        <Ticket tone="good" label={`Joiners and leavers, ${q}`} value={`${s.quarter.joined} / ${s.quarter.left}`} note={`${s.quarter.joined} joined, ${s.quarter.left} left.${s.upcoming.n ? ` ${s.upcoming.n} more join ${shortDate(s.upcoming.on)}` : ""}`} />
        <Ticket tone="attention" label="On probation" value={String(s.probation.open)} note={`${plural(s.probation.dueThisMonth, "review")} due this month`} />
        <Ticket tone="attention" label="Documents missing" value={String(s.documentsMissing)} note="Requested, not yet received" />
      </div>
      <div className="cols even" style={{ marginBottom: 28 }}>
        <div className="card">
          <div className="card-head"><h2>People by department</h2><span className="muted" style={{ fontSize: 13 }}>{plural(s.headcount, "person", "people")}</span></div>
          <HBars label="People by department" labels={s.departments.map((d) => d.name)} values={s.departments.map((d) => d.n)} />
        </div>
        <div className="card">
          <div className="card-head"><h2>Joiners and leavers</h2><span className="up">{joined} joined, {left} left: net {joined - left >= 0 ? "+" : ""}{joined - left} this year</span></div>
          <GBars label="Joiners and leavers per month" labels={s.months} max={8} step={2}
            series={[{ name: "Joiners", color: "#2FCB8C", data: s.joiners }, { name: "Leavers", color: "#F48B9B", data: s.leavers }]} />
          <div className="legend"><span><i className="sq" style={{ background: "#2FCB8C" }} />Joiners</span><span><i className="sq" style={{ background: "#F48B9B" }} />Leavers</span></div>
        </div>
      </div>
      <Directory rows={dir.rows} total={dir.total} today={today.toISOString().slice(0, 10)} allHref={all ? undefined : entity ? `/hr/e/${entity.code}/all` : "/hr/all"} />
    </>
  );
}

/** The same screen with the whole directory instead of the first 25. */
export const PeopleAllPage = (props: ScreenProps) => PeoplePage({ ...props, params: { ...props.params, all: "all" } });
