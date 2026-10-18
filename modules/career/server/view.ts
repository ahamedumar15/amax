import type { Viewer } from "@amax/auth";
import { personIdsForUser } from "@amax/hr/contracts";
import type { CareerEvent, Project } from "../contracts";
import { techColour } from "../layout/colours";
import { layoutTree, spanLabel, type Tree } from "../layout/tree";
import { monthLabel } from "../layout/months";
import { longDate, month, plural, tenure } from "./format";
import { getCareer, type Career } from "./queries";
import { read } from "./read";
import { traceView, type TraceView } from "./rows";

export type Ticket = { label: string; value: string; note: string };
export type CareerScreen = Career & { tree: Tree; labels: Record<string, string>; traces: Record<string, TraceView>; selected: string | null; lede: string; tickets: Ticket[]; key: { name: string; colour: string }[] };

const of = <K extends CareerEvent["kind"]>(events: CareerEvent[], kind: K) => events.filter((e): e is Extract<CareerEvent, { kind: K }> => e.kind === kind);

/** The month most projects ran at once, and how many. */
function busiest(projects: Project[], today: string) {
  const months = new Map<string, number>();
  for (const p of projects) for (const m of new Set(p.months.map((x) => x.month).filter((x) => x <= today))) months.set(m, (months.get(m) ?? 0) + 1);
  return [...months].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null;
}

function lede(c: Career) {
  const waiting = of(c.events, "technology").reduce((n, e) => n + e.names.length, 0);
  const expired = of(c.events, "certification").filter((e) => e.expiresOn && e.expiresOn < c.today).at(-1);
  const parts = [waiting ? `${plural(waiting, "technology", "technologies")} proposed by the agent wait${waiting === 1 ? "s" : ""} for confirmation` : "", expired ? `the ${expired.name} certification expired in ${month(expired.expiresOn!)}` : ""].filter(Boolean);
  const first = parts.length ? `${parts.join(", and ")}.` : "Nothing is waiting for confirmation.";
  return `${first.charAt(0).toUpperCase()}${first.slice(1)} Everything below is read from HR, allocations, learning and delivery; nothing is typed in here.`;
}

function tickets(c: Career, tree: Tree): Ticket[] {
  const grades = [...of(c.events, "joined"), ...of(c.events, "grade")];
  const projects = of(c.events, "project");
  const techs = new Set(projects.flatMap((p) => p.technologies.map((t) => t.name)));
  const peak = busiest(projects, c.today);
  const certs = of(c.events, "certification");
  const latest = grades.at(-1);
  return [
    { label: "Tenure", value: tenure(tree.start, c.today), note: `Joined ${longDate(tree.start)}` },
    { label: "Promotions", value: String(of(c.events, "grade").length), note: latest ? `${latest.kind === "grade" ? latest.after : latest.grade} since ${month(latest.on)}` : "No grade recorded" },
    { label: "Projects", value: String(projects.length), note: `${plural(techs.size, "technology", "technologies")}${peak && peak[1] > 1 ? ` · ${peak[1]} at once in ${month(peak[0])}` : ""}` },
    { label: "Certifications", value: String(certs.length), note: `${certs.filter((e) => e.expiresOn && e.expiresOn < c.today).length} expired` },
  ];
}

function labels(c: Career, t: Tree) {
  const byId = new Map(c.events.map((e) => [e.id, e]));
  const out: Record<string, string> = {};
  for (const b of t.branches) out[b.key] = `Project ${b.name}, ${spanLabel(t, b).replace(" – ", " to ")}, ${b.percent} percent. Technologies: ${b.technologies.map((x) => `${x.name}${x.proposed ? " (proposed)" : ""}`).join(", ") || "none tagged"}`;
  for (const r of t.rings) out[r.eventId] = `${r.joined ? "Joined as" : "Promoted to"} ${r.grade}, ${monthLabel(t.start, r.m)}`;
  for (const f of t.fruit) { const e = byId.get(f.eventId); out[f.eventId] = `Certification ${f.name}, issued ${month(e!.on)}, ${f.expired ? `expired ${month((e as { expiresOn: string }).expiresOn)}` : "valid"}`; }
  for (const r of t.roots) out[`root:${r.eventId}:${r.sub}`] = `${r.label}, ${r.sub}`;
  return out;
}

export async function careerScreen(viewer: Viewer, idOrNo: string): Promise<CareerScreen | null> {
  const c = await getCareer(viewer, /^[0-9a-f-]{36}$/.test(idOrNo) ? { personId: idOrNo } : { employeeNo: idOrNo });
  if (!c) return null;
  const tree = layoutTree(c.events, c.today);
  const names = [...new Set(tree.branches.flatMap((b) => b.technologies.map((x) => x.name)))];
  const promoted = [...of(c.events, "grade"), ...of(c.events, "joined")].sort((a, b) => b.on.localeCompare(a.on))[0];
  return { ...c, tree, labels: labels(c, tree), traces: Object.fromEntries(c.events.map((e) => [e.id, traceView(e, c.events, c.today)])), selected: promoted?.id ?? c.events.at(-1)?.id ?? null,
    lede: lede(c), tickets: tickets(c, tree), key: names.map((name) => ({ name, colour: techColour(name) })) };
}

/** The signed-in person's own career, for /career. */
export async function myCareerScreen(viewer: Viewer) {
  const [id] = await read(viewer, (tx) => personIdsForUser(tx, viewer.userId));
  return id ? careerScreen(viewer, id) : null;
}
