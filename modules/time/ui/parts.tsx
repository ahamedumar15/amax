import type { Viewer } from "@amax/auth";
import { Card, EmptyState } from "@amax/ui";
import type { WeekStatus } from "../contracts";
import { notFound } from "next/navigation";
import { wantedWeek } from "../server/weeks";
import { shiftWeek, weekKey, type IsoWeek } from "../week";
import "./time.css";

export const hrs = (n: number) => (n ? n.toFixed(1) : "–");
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];
export const COLORS = ["var(--violet)", "var(--amber)", "var(--pink)", "var(--mint)"];
export const STATUS: Record<WeekStatus, [string, string]> = { draft: ["draft", "Draft"], submitted: ["good", "Submitted"], approved: ["good", "Approved"], rejected: ["bad", "Rejected"] };
export const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
export const avatar = (name: string) => `a${([...name].reduce((n, c) => n + c.charCodeAt(0), 0) % 4) + 1}`;
const date = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function weekSpan(week: IsoWeek, days: string[]) {
  // No "today" marker: these render on the server, which doesn't know the viewer's calendar day.
  return `Week ${week.week}, Mon ${date(days[0])} to Fri ${date(days[4])}`;
}

/** The week in a screen URL: absent is the latest week, anything wantedWeek refuses is a 404. */
export function weekParam(key: string | undefined): IsoWeek | undefined {
  try {
    return wantedWeek(key);
  } catch {
    notFound();
  }
}

export const weekHref = (base: "" | "/my", w: IsoWeek) => `/time${base || "/w"}/${weekKey(w)}`;

export const viewerOrNull = (viewer: unknown) => (viewer as Viewer | null) ?? null;

export const SignInFirst = () => (
  <Card><EmptyState icon="clock" title="Sign in to see timesheets" hint="Hours, approvals and your own timesheet come from the database once you're signed in." /></Card>
);

export function Head({ title, lede, week, base }: { title: string; lede: string; week: IsoWeek; base: "" | "/my" }) {
  return (
    <div className="row head">
      <div><h1>{title}</h1><p className="lede">{lede}</p></div>
      <div className="actions">
        <div className="seg" role="group" aria-label="View">
          <a href={weekHref("", week)} aria-current={base === "" ? "page" : undefined}>Team</a>
          <a href={weekHref("/my", week)} aria-current={base === "/my" ? "page" : undefined}>My timesheet</a>
        </div>
        <a className="btn sm" aria-label="Previous week" href={weekHref(base, shiftWeek(week, -1))}>‹</a>
        <a className="btn sm" aria-label="Next week" href={weekHref(base, shiftWeek(week, 1))}>›</a>
      </div>
    </div>
  );
}
