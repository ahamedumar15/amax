import type { Viewer } from "@amax/auth";
import { Card, EmptyState } from "@amax/ui";
import type { Sla } from "../server/rows";
import "./helpdesk.css";

export const viewerOrNull = (viewer: unknown) => (viewer as Viewer | null) ?? null;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "45 min", "10 h", "2 d": whole units, rounded down. */
export function span(minutes: number) {
  const m = Math.abs(minutes);
  return m < 60 ? `${m} min` : m < 24 * 60 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} d`;
}

/** "Opened 3 h ago": against the tenant's clock, never in the future. */
export const ago = (iso: string, now: string) => {
  const min = Math.max(0, Math.round((Date.parse(now) - Date.parse(iso)) / 60_000));
  return min < 1 ? "just now" : `${min < 60 ? `${min} min` : min < 2880 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`} ago`;
};

export function SlaLeft({ sla }: { sla: Sla }) {
  if (sla.stage === "done") return <span className="chip good">Done</span>;
  if (sla.stage === "paused") return <span className="chip">Waiting on requester</span>;
  if (sla.leftMinutes === null) return <span className="muted">No target</span>;
  if (sla.breached) return <span className="chip bad">{span(sla.leftMinutes)} over</span>;
  const text = `${span(sla.leftMinutes)} left${sla.stage === "response" ? " to respond" : ""}`;
  return sla.near ? <span className="down">{text}</span> : <>{text}</>;
}

export const SignInFirst = () => (
  <Card><EmptyState icon="help" title="Sign in to see the helpdesk" hint="Queues and tickets come from the database once you're signed in." /></Card>
);
