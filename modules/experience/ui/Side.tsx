import { PinButton } from "@amax/ui";
import { CHOICE_LABEL } from "../contracts";
import { viewPin } from "../pins";
import type { ExperienceView } from "../server/views";
import { shortDate } from "./parts";

export function Pulse({ v }: { v: ExperienceView }) {
  const p = v.pulse;
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>{p ? `Pulse, ${shortDate(p.sentOn)}` : "Pulse"}</h2><span className="muted" style={{ fontSize: 13 }}>{p ? `${p.answers} answers` : "None sent"}</span></div>
      {p && <p style={{ fontSize: 14, marginBottom: 12 }}>{p.question}</p>}
      {p?.shares ? p.shares.map((s) => (
        <div key={s.choice} className="row line pinnable"><span>{CHOICE_LABEL[s.choice]}</span><b className={s.choice === "a-lot" ? "warn-t" : undefined}>{s.percent}%</b>
          <PinButton pin={viewPin(`Pulse ${shortDate(p.sentOn)}: ${CHOICE_LABEL[s.choice]}`)} /></div>
      )) : <div className="row line pinnable"><span className="muted">{p ? "Shown once 5 people have answered" : "One anonymous question, at most once a fortnight"}</span><PinButton pin={viewPin("Pulse")} /></div>}
    </div>
  );
}

const COLLECT: [string, (on: boolean) => string][] = [
  ["Device health, boot time, app crashes", (on) => (on ? "Yes" : "Not yet")],
  ["Keystrokes, screens, browsing, activity", () => "Never"],
  ["Scores for one named person", () => "Never"],
];

// AC-1, AC-2: what is collected, and from when the staff notice went out.
export function Collect({ v }: { v: ExperienceView }) {
  const on = v.collection.entities > 0;
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>What we collect</h2>{on && v.collection.noticeOn ? <span className="chip good">Notice sent {shortDate(v.collection.noticeOn)}</span> : <span className="chip warn">Not collecting</span>}</div>
      {COLLECT.map(([what, value]) => (
        <div key={what} className="row line pinnable"><span>{what}</span><b>{value(on)}</b><PinButton pin={viewPin(`What we collect: ${what}`)} /></div>
      ))}
    </div>
  );
}
