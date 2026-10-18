import type { ScreenProps } from "@amax/core";
import { canEver } from "@amax/auth";
import { IntentButton, PinButton } from "@amax/ui";
import { leaveOverview, type Overview } from "../server/overview";
import { ART_SPRITE } from "./art";
import { Calendar } from "./Calendar";
import { Bars, Donut } from "./charts";
import { longDate, monthParam, SignInFirst, styleOf, viewerOrNull } from "./parts";
import { Requests } from "./Requests";
import { Tickets } from "./Tickets";

const pin = (label: string) => <PinButton inline pin={{ label, tool: "get_leave_overview", args: {} }} />;

function lede(o: Overview) {
  const clash = o.waiting.find((r) => r.clashes.length);
  const first = clash ? `${clash.personName.split(" ")[0]} asked for ${clash.dates} off, while ${clash.clashes[0].replace(/^Overlaps /, "")} is in flight.`
    : o.waiting.length ? `${o.waiting.length} ${o.waiting.length === 1 ? "request waits" : "requests wait"} for you, none clashing with a release.` : "Nothing is waiting for you.";
  const next = o.nextHoliday ? ` Next public holiday: ${o.nextHoliday.name}, ${longDate(o.nextHoliday.on)}.` : "";
  return `${first}${next}`;
}

export async function LeavePage({ viewer: raw, params }: ScreenProps) {
  const viewer = viewerOrNull(raw);
  if (!viewer) return <div className="leave"><h1>Leave</h1><SignInFirst /></div>;
  const o = await leaveOverview(viewer, params.month ? monthParam(params.month, "") : undefined);
  const year = o.today.slice(0, 4), taken = o.stats.byType.reduce((n, [, d]) => n + d, 0);
  const months = o.stats.perMonth;
  return (
    <div className="leave">
      <div dangerouslySetInnerHTML={{ __html: ART_SPRITE }} />
      <div className="row head">
        <div><h1>Leave</h1><p className="lede">{lede(o)}</p></div>
        <div className="actions">
          <a className="btn" href="#leave-calendar">Holiday calendar</a>
          {canEver(viewer, "leave:request") && <IntentButton intent="leave.request" label="Request leave" />}
        </div>
      </div>
      <Tickets o={o} />
      <Calendar cal={o.calendar} labels={o.labels} />
      <div className="cols even" style={{ marginBottom: 28 }}>
        <div className="card pinnable">
          <div className="card-head"><h2>Leave taken by type</h2>{pin("Leave taken by type")}<span className="muted" style={{ fontSize: 13 }}>{year}, in days</span></div>
          <Donut label="Leave taken by type" center={String(taken)} sub="days taken" parts={o.stats.byType.map(([t, d]) => ({ name: o.labels[t] ?? t, value: d, color: styleOf(t).color }))} />
        </div>
        <div className="card pinnable">
          <div className="card-head"><h2>Leave days per month</h2>{pin("Leave days per month")}<span className="muted" style={{ fontSize: 13 }}>Everyone you can see</span></div>
          <Bars label="Leave days per month" labels={months.map((m) => m.month)} values={months.map((m) => m.days)} max={Math.max(100, Math.ceil(Math.max(0, ...months.map((m) => m.days)) / 50) * 50)} partial />
        </div>
      </div>
      <Requests rows={o.waiting} />
    </div>
  );
}
