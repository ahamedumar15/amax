import { PHASES, type Phase } from "../contracts";
import type { EventKind } from "../server/proposal-detail";

// 081 amendment 4: the figures behind the board's band, the proposal's stepper and its Time band, kept pure so each is
// tested on its own and the pages only lay them out.

const NAME: Record<Phase, string> = { proposed: "proposed", planned: "planned", building: "building", verified: "verified", released: "released" };
const IN_FLIGHT: Phase[] = ["proposed", "planned", "building", "verified"];

/** AC-42 Proposals: what is in flight (Proposed to Verified), per phase, and the bar's sentence for a screen reader. */
export function proposalsBand(rows: { phase: Phase }[]) {
  const segments = IN_FLIGHT.map((phase) => ({ phase, count: rows.filter((r) => r.phase === phase).length })).filter((s) => s.count > 0);
  const total = segments.reduce((n, s) => n + s.count, 0);
  const sentence = `${total} ${total === 1 ? "proposal" : "proposals"} in flight${total ? `: ${segments.map((s) => `${s.count} ${NAME[s.phase]}`).join(", ")}` : ""}`;
  return { total, segments, sentence };
}

/**
 * AC-42 Tasks: done of total, the done ones split by who closed them. Only some closes are recorded per task (a synced
 * project's counters come from the repo), so what isn't recorded shows as its own part rather than being guessed.
 */
export function tasksBand(done: number, total: number, closedBy: { agents: number; people: number }) {
  const agents = Math.min(closedBy.agents, done);
  const people = Math.min(closedBy.people, done - agents);
  const unrecorded = done - agents - people;
  const open = Math.max(0, total - done);
  const parts = [`${agents} by agents`, `${people} by people`, ...(unrecorded ? [`${unrecorded} not recorded`] : []), `${open} open`];
  return { done, total, agents, people, unrecorded, open, sentence: `${done} of ${total} tasks done: ${parts.join(", ")}` };
}

export type Step = { phase: Phase; state: "done" | "current" | "todo" | "withdrawn"; at: string | null };

/**
 * AC-47: the five phases, each done, current or to do. A done step carries the date the proposal last entered it
 * (Proposed: when it was made; Released: when it reached Prod). A withdrawn proposal crosses out the step it was in.
 */
export function stepsOf(p: { phase: Phase; withdrawn: boolean; createdAt: string | null; releasedAt: string | null; history: { kind: EventKind; to?: string; at: string }[] }): Step[] {
  const at = (phase: Phase) => {
    if (phase === "released" && p.releasedAt) return p.releasedAt;
    const moved = p.history.filter((h) => h.kind === "moved" && h.to === phase).map((h) => h.at).sort().at(-1);
    return moved ?? (phase === "proposed" ? p.createdAt : null);
  };
  const now = PHASES.indexOf(p.phase);
  return PHASES.map((phase, i) => ({
    phase,
    state: i < now ? "done" : i === now ? (p.withdrawn ? "withdrawn" : p.phase === "released" ? "done" : "current") : "todo",
    at: i <= now ? at(phase) : null,
  }));
}

/** AC-49: approved hours against the estimate; hours past it are their own part, never folded into the bar's 100%. */
export function timeBand(hours: number, estimate: number | null) {
  const h = (n: number) => `${Number(n.toFixed(2))} h`;
  if (!estimate) return { hours, estimate: null, within: hours, over: 0, left: 0, figure: h(hours), rest: "approved · no estimate", sentence: `${h(hours)} approved, no estimate` };
  const within = Math.min(hours, estimate);
  const over = Math.max(0, hours - estimate);
  const left = Math.max(0, estimate - hours);
  const sentence = over ? `${h(hours)} approved of ${h(estimate)} estimated, ${h(over)} over` : `${h(hours)} approved of ${h(estimate)} estimated, ${h(left)} left`;
  return { hours, estimate, within, over, left, figure: h(hours), rest: `of ${h(estimate)} estimated`, sentence };
}
