import { facet, PinButton, type PinRef } from "@amax/ui";
import { projectHref, type Phase } from "../contracts";
import { proposalsBand, tasksBand } from "./band";
import { PHASE_UI, Stk } from "./parts";

// 081 amendment 4 (AC-42): the board leads with two facts as bars, as Team time does: what is in flight, phase by
// phase, and how far the tasks are, with who closed them. Each legend item of Proposals opens the project's Proposals
// tab filtered to that phase (a read-only link); each part pins to the project.
type Props = { project: { key: string; pin: PinRef }; proposals: { phase: Phase }[]; done: number; total: number; closedBy: { agents: number; people: number } };

export function BoardBand({ project, proposals, done, total, closedBy }: Props) {
  const p = proposalsBand(proposals);
  const t = tasksBand(done, total, closedBy);
  if (!p.total && !t.total) return null;
  const href = (phase: Phase) => `${projectHref(project.key, "proposals")}/${phase}`;
  return (
    <div className="dv-band" role="group" aria-label={`${project.key} at a glance`}>
      {p.total > 0 && (
        <section className="card pinnable" aria-labelledby="dv-band-proposals">
          <PinButton pin={facet(project.pin, " proposals in flight")} />
          <h2 className="k" id="dv-band-proposals">Proposals</h2>
          <p className="fig">{p.total} <span>in flight</span></p>
          <div className="bar" role="img" aria-label={p.sentence}>
            {p.segments.map((s) => <i key={s.phase} style={{ flexGrow: s.count, background: PHASE_UI[s.phase].color }} />)}
          </div>
          <ul className="legend">
            {p.segments.map((s) => (
              <li key={s.phase}><a href={href(s.phase)} style={{ ["--c" as string]: PHASE_UI[s.phase].color }}><Stk phase={s.phase} />{s.count} {PHASE_UI[s.phase].label.toLowerCase()}</a></li>
            ))}
          </ul>
        </section>
      )}
      {t.total > 0 && (
        <section className="card pinnable" aria-labelledby="dv-band-tasks">
          <PinButton pin={facet(project.pin, " tasks")} />
          <h2 className="k" id="dv-band-tasks">Tasks</h2>
          <p className="fig">{t.done} <span>of {t.total} done</span></p>
          <div className="bar" role="img" aria-label={t.sentence}>
            {([["agents", t.agents], ["people", t.people], ["unrecorded", t.unrecorded], ["open", t.open]] as const)
              .filter(([, n]) => n > 0).map(([k, n]) => <i key={k} className={k} style={{ flexGrow: n }} />)}
          </div>
          <ul className="legend">
            <li><span className="agents"><Glyph kind="agents" />Agents {t.agents}</span></li>
            <li><span className="people"><Glyph kind="people" />People {t.people}</span></li>
            {t.unrecorded > 0 && <li><span className="unrecorded"><Glyph kind="unrecorded" />Not recorded {t.unrecorded}</span></li>}
            <li><span className="open"><Glyph kind="open" />Open {t.open}</span></li>
          </ul>
        </section>
      )}
    </div>
  );
}

// A shape per part, so the legend never relies on colour alone.
const SHAPES: Record<string, React.ReactNode> = {
  agents: <path d="M8 1.5l1.6 4.2 4.4.3-3.4 2.8 1.1 4.3L8 10.7l-3.7 2.4 1.1-4.3L2 6l4.4-.3z" />,
  people: <circle cx="8" cy="8" r="5" />,
  unrecorded: <path d="M3 8h10" fill="none" strokeWidth="2.2" />,
  open: <circle cx="8" cy="8" r="4.6" fill="none" strokeWidth="1.8" />,
};
export const Glyph = ({ kind }: { kind: string }) => <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" stroke="currentColor" strokeLinecap="round">{SHAPES[kind]}</svg>;
