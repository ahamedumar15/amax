import type { CareerEvent, Move, Project } from "../contracts";
import { longDate, month, range, whoWhen } from "./format";

export type Tone = "good" | "warn";
/** One "What changed" row: the same event the tree draws, in words. */
export type Row = { id: string; kind: CareerEvent["kind"]; on: string; title: string; sub: string; chip: { tone: Tone; label: string } | null };

/** The months a project ran up to today, its peak allocation, and whether it runs on today. */
export function spanOf(p: Project, today: string) {
  const months = p.months.map((m) => m.month).filter((m) => m <= today).sort();
  const last = months.at(-1) ?? p.on;
  return { from: months[0] ?? p.on, to: last.slice(0, 7) === today.slice(0, 7) ? null : last, percent: Math.max(0, ...p.months.map((m) => m.percent)) };
}

const field = (m: Move) => (m.field === "manager" ? "Manager" : m.field === "department" ? "Department" : "Entity");
const expiry = (exp: string | null, today: string) => (!exp ? "no expiry" : exp < today ? `expired ${month(exp)}` : `valid to ${month(exp)}`);

export function rowOf(e: CareerEvent, all: CareerEvent[], today: string): Row {
  const row = (title: string, sub: string, chip: Row["chip"] = null): Row => ({ id: e.id, kind: e.kind, on: e.on, title, sub, chip });
  switch (e.kind) {
    case "joined": {
      const boss = all.find((o): o is Move => o.kind === "move" && o.field === "manager" && o.on === e.on);
      return row(`Joined as ${e.grade}`, `${longDate(e.on)} · ${e.department}, ${e.entity}${boss ? ` · manager ${boss.after}` : ""}`);
    }
    case "grade": return row(e.after, `${longDate(e.on)} · ${e.trace.approvedBy ? `approved by ${e.trace.approvedBy}` : `recorded by ${whoWhen(e.trace.recordedBy, e.trace.recordedFor, null)}`}`);
    case "move": return row(`${field(e)} ${e.after}`, `${month(e.on)}${e.before ? ` · from ${e.before}` : ""}`);
    case "project": {
      const s = spanOf(e, today);
      const techs = e.technologies.map((t) => (t.proposed ? `${t.name} (proposed)` : t.name)).join(", ");
      return row(`${e.name}${s.percent < 100 ? `, ${s.percent}%` : ""}`, `${range(s.from, s.to)} · ${techs || "no technologies tagged"}`);
    }
    case "certification": {
      const old = !!e.expiresOn && e.expiresOn < today;
      return row(e.name, `${month(e.on)} · ${expiry(e.expiresOn, today)}`, old ? { tone: "warn", label: "Expired" } : { tone: "good", label: "Valid" });
    }
    case "technology":
      return row(`${e.names.join(", ")} proposed on ${e.projectName}`, `${whoWhen(e.trace.recordedBy, e.trace.recordedFor, e.on)} · ${e.trace.source.label.toLowerCase()}`, { tone: "warn", label: "To confirm" });
  }
}

/** Newest first, as the list shows them. */
export const rowsOf = (events: CareerEvent[], today: string) => [...events].reverse().map((e) => rowOf(e, events, today));

export type TraceView = { title: string; lines: [string, string][]; source: { label: string; href: string | null; ref: string | null } };

const change = (e: CareerEvent, today: string): [string, string] => {
  switch (e.kind) {
    case "joined": return ["Joined", `${e.grade}, ${e.department}, ${e.entity}`];
    case "grade": return ["Grade", `${e.before} → ${e.after}`];
    case "move": return [field(e), `${e.before ?? "None"} → ${e.after}`];
    case "project": { const s = spanOf(e, today); return ["Allocation", `${s.percent}%, ${range(s.from, s.to)}${e.client ? ` · ${e.client}` : ""}`]; }
    case "certification": return ["Certification", `Issued ${month(e.on)}, ${expiry(e.expiresOn, today)}`];
    case "technology": return ["Technologies", `${e.names.join(", ")}, waiting for a person to confirm`];
  }
};

/** The Selected card (AC-4): what changed, when, who recorded and approved it, and its source. */
export function traceView(e: CareerEvent, all: CareerEvent[], today: string): TraceView {
  const t = e.trace;
  const title = e.kind === "grade" ? `Promoted to ${e.after}` : e.kind === "move" ? `${field(e)} ${e.before ? `${e.before} → ` : ""}${e.after}` : rowOf(e, all, today).title;
  return { title, source: { label: t.source.label, href: t.source.href, ref: t.traceRef },
    lines: [change(e, today), ["Effective", longDate(e.on)], ["Recorded by", whoWhen(t.recordedBy, t.recordedFor, t.recordedAt)], ["Approved by", t.approvedBy ? whoWhen(t.approvedBy, null, t.approvedAt) : "No approval recorded"]] };
}
