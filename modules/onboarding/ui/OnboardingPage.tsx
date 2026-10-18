import type { ScreenProps } from "@amax/core";
import { listChecklists, onboardingSummary, type OnboardingSummary } from "../server/queries";
import { today } from "../server/read";
import { Attention, Tickets } from "./Attention";
import { ChecklistCard } from "./ChecklistCard";
import { needViewer, plural, SignInFirst } from "./parts";

function lede(s: OnboardingSummary) {
  const joiners = s.joiners.length ? `${s.joiners[0].personName}${s.joiners.length > 1 ? ` and ${plural(s.joiners.length - 1, "other")}` : ""} join${s.joiners.length === 1 ? "s" : ""} in the next 30 days.` : "No one joins in the next 30 days.";
  const overdue = s.overdue.length ? `${plural(s.overdue.length, "task")} ${s.overdue.length === 1 ? "is" : "are"} overdue.` : "Nothing is overdue.";
  const leavers = s.leavers.length ? `${plural(s.leavers.length, "person", "people")} leave${s.leavers.length === 1 ? "s" : ""} this week.` : "No one leaves this week.";
  return `${joiners} ${overdue} ${leavers} Tasks go to HR, IT Admin and the manager; ask amax to tick one off.`;
}

// 013 T1: what needs attention leads (overdue tasks, joiners starting soon, leavers this week), then
// each person's checklist, open ones first. Every row and tile is pinned; there are no forms.
export async function OnboardingPage({ viewer: raw }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Onboarding and offboarding</h1><SignInFirst /></>;
  const on = today();
  const [s, all] = await Promise.all([onboardingSummary(viewer, on), listChecklists(viewer, on)]);
  const ordered = [...all.filter((c) => !c.completedOn), ...all.filter((c) => c.completedOn)];
  return (
    <div className="onboarding">
      <div className="row head"><div><h1>Onboarding and offboarding</h1><p className="lede">{lede(s)}</p></div></div>
      <Tickets s={s} />
      <div className="cols">
        <div className="stack">
          {ordered.map((c) => <ChecklistCard key={c.id} c={c} />)}
          {!ordered.length && <div className="card"><p className="empty-line">No checklists yet. One starts when HR records a joiner or a leaver.</p></div>}
        </div>
        <Attention s={s} />
      </div>
    </div>
  );
}
