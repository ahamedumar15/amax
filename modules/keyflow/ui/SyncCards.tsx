import { PinButton, Ticket } from "@amax/ui";
import type { Overview } from "../server/overview";
import { ago, plural } from "./parts";

const view = (label: string) => <PinButton pin={{ label, tool: "get_keyflow_sync", args: {} }} />;

function where(o: Overview) {
  if (!o.connection) return "Not connected";
  const at = o.connection.sandbox ? "Sandbox Keyflow (fictional)" : o.connection.endpoint;
  return `${at}, last sync ${o.lastRun ? ago(o.lastRun.finishedAt) : "not yet"}`;
}

export function SisterCard({ o }: { o: Overview }) {
  const [tone, label] = !o.connection ? ["", "Not connected"] : o.errors.length ? ["warn", plural(o.errors.length, "error")] : o.lastRun?.status === "failed" ? ["bad", "Last sync failed"] : ["good", "Two-way sync"];
  return (
    <div className="app-card sister pinnable">
      <span className="logo-sq big" aria-hidden="true">K</span>
      <div><h2>Keyflow, sister product</h2><p>OKRs, check-ins, feedback and recognition stay in Keyflow. amax sends people and teams; Keyflow sends goals, review scores and recognition back to each person&apos;s Performance page.</p></div>
      <div className="end"><span className={`chip ${tone}`}>{label}</span><div className="muted">{where(o)}</div></div>
      {view("Keyflow sync")}
    </div>
  );
}

export function SyncTickets({ o }: { o: Overview }) {
  const kinds = [o.byKind.refused && `${o.byKind.refused} refused by Keyflow`, o.byKind.unmatched && plural(o.byKind.unmatched, "unmatched person", "unmatched people"), o.byKind.invalid && `${o.byKind.invalid} unreadable`].filter(Boolean);
  const next = o.nextRunAt ? `${o.every}, next ${ago(o.nextRunAt)}` : "Starts once Keyflow is connected";
  return (
    <div className="tickets four">
      <Ticket tone={o.errors.length ? "problem" : "good"} label="Sync errors" value={String(o.errors.length)} note={kinds.join(", ") || "Nothing to fix"} art={view("Sync errors")} />
      <Ticket tone={o.lastRun?.status === "failed" ? "problem" : "good"} label="Last sync" value={o.lastRun ? ago(o.lastRun.finishedAt) : "Not yet"} note={next} art={view("Last sync")} />
      <Ticket tone="info" label="Sent to Keyflow" value={plural(o.out.people, "person", "people")} note={plural(o.out.teams, "team")} art={view("Sent to Keyflow")} />
      <Ticket tone="attention" label="From Keyflow" value={plural(o.in.goals, "goal")} note={`${plural(o.in.reviews, "review score")}, ${plural(o.in.recognition, "recognition")}`} art={view("From Keyflow")} />
    </div>
  );
}
