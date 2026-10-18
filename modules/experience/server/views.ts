import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { CHOICES, DIMENSIONS, MIN_GROUP, type Dimension } from "../contracts";
import { baseline, scoring, type Latest } from "./groups";
import { issues, type Issue } from "./phrases";
import { installed, read, uuids } from "./read";
import { trendOf, type Group, type Reading } from "./score";

// AC-3: a device needs attention when its apps crashed 3 or more times, Defender rates it medium or
// high risk, or its startup score is under 40.
const attention = (l: Latest) => l.crashes >= 3 || l.risk === "medium" || l.risk === "high" || l.startup < 40;

/** For each group, the open issue touching most of its devices, by its title. */
async function topIssue(tx: Tx, open: Issue[], readings: Reading[]) {
  const links = await tx.execute(sql`select issue_id, device_id from experience.issue_device where issue_id = any(${uuids(open.map((i) => i.id))}::uuid[])`);
  return (g: Group) => {
    const mine = new Set(readings.filter((r) => g.members.includes(r.key)).map((r) => r.device));
    const n = new Map<string, number>();
    for (const l of links) if (mine.has(l.device_id as string)) n.set(l.issue_id as string, (n.get(l.issue_id as string) ?? 0) + 1);
    const best = [...n].sort((a, b) => b[1] - a[1])[0];
    return best ? open.find((i) => i.id === best[0])!.title : null;
  };
}

async function collection(tx: Tx, entities: string[]) {
  const rows = await tx.execute(sql`select enabled, notice_on::text as notice_on from experience.collection where legal_entity_id = any(${uuids(entities)}::uuid[])`);
  const on = rows.filter((r) => r.enabled);
  return { entities: on.length, noticeOn: on.map((r) => r.notice_on as string).sort().at(-1) ?? null };
}

async function trends(tx: Tx, s: Awaited<ReturnType<typeof scoring>>, dimension: Dimension) {
  const before = s.full ? await baseline(tx, dimension, s.today) : new Map<string, number>();
  return (g: Group) => trendOf(g.score, before.get(g.key) ?? null);
}

/** The group that fell most, a point or more over four weeks, by department (for the lede). */
async function dropped(tx: Tx, v: Viewer) {
  const s = await scoring(tx, v, "department");
  const trend = await trends(tx, s, "department");
  const g = s.groups.filter((x) => (trend(x).delta ?? 0) <= -1).sort((a, b) => a.score - b.score)[0];
  return g ? { group: g.label, score: g.score } : null;
}

/** The whole screen for one grouping, in the legal entities the viewer may see. */
export const experienceView = (v: Viewer, by?: string) => read(v, async (tx) => {
  const dimension: Dimension = DIMENSIONS.find((d) => d === by) ?? "department";
  const s = await scoring(tx, v, dimension);
  const open = await issues(tx, sql`status <> 'done'`);
  const [top, trend] = [await topIssue(tx, open, s.readings), await trends(tx, s, dimension)];
  const answers = s.pulse?.answers ?? [];
  return {
    today: s.today, dimension, all: s.all, hidden: s.hidden,
    groups: s.groups.map((g) => ({ ...g, top: top(g), trend: trend(g) })),
    devices: { total: s.latest.length, attention: s.latest.filter(attention).length },
    pulse: s.pulse && { id: s.pulse.id, question: s.pulse.question, sentOn: s.pulse.sentOn, recipients: s.pulse.recipients, answers: answers.length,
      shares: answers.length >= MIN_GROUP ? CHOICES.map((c) => ({ choice: c, percent: Math.round((100 * answers.filter((a) => a.choice === c).length) / answers.length) })) : null },
    fixes: open.filter((i) => i.suggestionId),
    dropped: await dropped(tx, v),
    collection: await collection(tx, s.entities.map((e) => e.id)),
    helpdesk: await installed(tx, "helpdesk.ticket"),
  };
});
export type ExperienceView = Awaited<ReturnType<typeof experienceView>>;
