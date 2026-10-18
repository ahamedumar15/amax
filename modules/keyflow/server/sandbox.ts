import type { KeyflowTransport, OutPerson } from "./transport";

// The sandbox Keyflow: a built-in, clearly fictional Keyflow the demo tenant syncs with, so demo data
// never calls a real endpoint. It refuses anyone who hasn't started yet (as Keyflow does), and its
// first answer carries the demo goals, review scores and recognition, keyed by employee number here
// and by amax's person ref on the wire. One goal names a Keyflow person amax doesn't know.
type G = [string, string, "on-track" | "at-risk" | "done", number, string];
type R = [string, number, string, string];
type K = [string, string, string];
const DATA: Record<string, { goals: G[]; reviews?: R[]; recognition?: K[] }> = {
  "LL-0417": {
    goals: [["g-0417-1", "Pass the AWS Solutions Architect exam", "at-risk", 20, "2026-12-15"], ["g-0417-2", "Cut Fleet Tracker p95 latency to 300 ms", "on-track", 70, "2026-12-31"], ["g-0417-3", "Mentor two associate engineers", "on-track", 50, "2026-12-31"]],
    reviews: [["2026 H1 review", 4.2, "Exceeds expectations", "2026-07-15"], ["2025 H2 review", 3.8, "Meets expectations", "2026-01-20"]],
    recognition: [["Maya Fernando", "Unblocked the v1.8.0 rollback on a Friday night (fictional)", "2026-10-14"], ["Nimal Silva", "Patient code reviews for the new joiners (fictional)", "2026-10-02"]],
  },
  "LL-0233": {
    goals: [["g-0233-1", "Ship Fleet Tracker v1.8.0 to production", "on-track", 80, "2026-11-30"], ["g-0233-2", "Grow two engineers to E4", "on-track", 40, "2027-03-31"]],
    reviews: [["2026 H1 review", 4.5, "Outstanding", "2026-07-15"]], recognition: [["Maya Fernando", "Kept the Fleet Tracker client calm through the rollback (fictional)", "2026-10-15"]],
  },
  "LL-0291": {
    goals: [["g-0291-1", "Automate the HR Insights regression suite", "at-risk", 35, "2026-11-15"], ["g-0291-2", "Set up QA dashboards", "done", 100, "2026-09-30"]],
    reviews: [["2026 H1 review", 4.0, "Exceeds expectations", "2026-07-15"]], recognition: [["Kasun Dias", "Caught the payroll rounding bug before UAT (fictional)", "2026-10-09"]],
  },
  "LL-0598": { goals: [["g-0598-1", "Finish the onboarding plan", "on-track", 90, "2026-10-31"], ["g-0598-2", "Ship a first production change", "done", 100, "2026-08-31"]], recognition: [["Ayesha Rahman", "Wrote the clearest test plan of the sprint (fictional)", "2026-10-07"]] },
  "LL-0612": { goals: [["g-0612-1", "Finish the onboarding plan", "on-track", 30, "2026-12-05"]], recognition: [["Nimal Silva", "Picked up the build pipeline in week one (fictional)", "2026-10-12"]] },
  "LL-0102": { goals: [["g-0102-1", "Hold Contoso Portal margin above 30%", "on-track", 60, "2026-12-31"]], reviews: [["2026 H1 review", 4.3, "Exceeds expectations", "2026-07-20"]] },
};
export const UNMATCHED_REF = "kf-9031";
const CURSOR = "sandbox:1";
const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function sandboxTransport(directory: Pick<OutPerson, "ref" | "employeeNo">[]): KeyflowTransport {
  const refOf = new Map(directory.map((p) => [p.employeeNo, p.ref]));
  const entries = Object.entries(DATA).flatMap(([no, d]) => (refOf.has(no) ? [[refOf.get(no)!, no, d] as const] : []));
  return {
    push: async (batch) => ({ refused: batch.people.filter((p) => p.status === "joining").map((p) => ({ ref: p.ref, reason: `hasn't started yet: starts ${p.joinedOn ? longDate(p.joinedOn) : "later"}` })) }),
    changes: async (cursor) => cursor === CURSOR ? { goals: [], reviews: [], recognition: [], cursor } : {
      goals: [...entries.flatMap(([personRef, , d]) => d.goals.map(([id, title, status, progress, dueOn]) => ({ id, personRef, title, status, progress, dueOn, period: "2026 H2" }))),
        { id: "g-9031-1", personRef: UNMATCHED_REF, title: "Launch the partner portal (fictional)", status: "on-track", progress: 10, dueOn: "2027-01-31", period: "2026 H2" }],
      reviews: entries.flatMap(([personRef, no, d]) => (d.reviews ?? []).map(([cycle, score, rating, reviewedOn], i) => ({ id: `r-${no}-${i}`, personRef, cycle, score, scale: 5, rating, reviewedOn }))),
      recognition: entries.flatMap(([personRef, no, d]) => (d.recognition ?? []).map(([fromName, message, givenOn], i) => ({ id: `k-${no}-${i}`, personRef, fromName, message, givenOn }))),
      cursor: CURSOR,
    },
  };
}
