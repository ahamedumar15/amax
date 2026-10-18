import { notFound } from "next/navigation";
import type { ScreenProps } from "@amax/core";
import { Card, EmptyState, PinButton, Ticket, type TicketTone } from "@amax/ui";
import { careerPin, personPin } from "../pins";
import { careerScreen, myCareerScreen, type CareerScreen } from "../server/view";
import { AskButton } from "./AskButton";
import { Board } from "./Board";
import { needViewer, SignInFirst } from "./parts";

const TONES: TicketTone[] = ["info", "attention", "good", "info"];

function Career({ s }: { s: CareerScreen }) {
  const p = s.person;
  const waiting = s.events.filter((e) => e.kind === "technology").reduce((n, e) => n + (e.kind === "technology" ? e.names.length : 0), 0);
  return (
    <div className="career">
      <nav className="crumb" aria-label="Breadcrumb"><a href="/hr">People</a><span aria-hidden="true">/</span><a href={`/hr/p/${encodeURIComponent(p.employeeNo)}`}>{p.name}</a><span aria-hidden="true">/</span>Career</nav>
      <div className="row head">
        <div><h1>{p.name}, career</h1><p className="lede">{s.lede}</p></div>
        <div className="actions">
          {waiting > 0 && <AskButton className="btn primary" label={`✦ Ask amax to review ${waiting} proposed`} prompt={`Review the technologies the agent proposed for ${p.name}`} pin={personPin(p)} />}
          <AskButton className="btn" label="✦ Ask amax to correct history" prompt={`Correct ${p.name}'s career history`} pin={personPin(p)} />
        </div>
      </div>
      <div className="tickets four">
        {s.tickets.map((t, i) => <Ticket key={t.label} tone={TONES[i]} label={t.label} value={t.value} note={t.note} art={<PinButton pin={careerPin(p, t.label.toLowerCase())} />} />)}
      </div>
      <Board s={s} />
    </div>
  );
}

// The person page's Career section (AC-2): served at /hr/p/:employeeNo/career, gated by hr:read there and career:read here.
export async function CareerPage({ params, viewer: raw }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <div className="career"><h1>Career</h1><SignInFirst /></div>;
  const s = await careerScreen(viewer, params.employeeNo);
  if (!s) notFound();
  return <Career s={s} />;
}

/** /career, from the profile menu: the signed-in person's own tree. */
export async function MyCareerPage({ viewer: raw }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <div className="career"><h1>Career</h1><SignInFirst /></div>;
  const s = await myCareerScreen(viewer);
  if (!s) return <div className="career"><h1>Your career</h1><Card><EmptyState icon="user" title="No HR record for you yet" hint="Your career shows here once HR has your employment record." /></Card></div>;
  return <Career s={s} />;
}
