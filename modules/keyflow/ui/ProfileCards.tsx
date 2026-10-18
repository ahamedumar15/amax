import { EmptyState, Masked, PinButton } from "@amax/ui";
import type { KeyflowProfile, ReviewScore } from "../contracts";
import { avatar, GOAL_CHIP, initials, shortDate } from "./parts";

type P = { p: KeyflowProfile };
const record = (p: KeyflowProfile, label: string, id: string) => <PinButton pin={{ label: `${p.name}, ${label}`, tool: "get_keyflow_record", args: { recordId: id } }} />;
const card = (p: KeyflowProfile, label: string) => <PinButton inline pin={{ label: `${p.name}, ${label}`, tool: "get_keyflow_profile", args: { personId: p.personId } }} />;

export function GoalsCard({ p }: P) {
  const period = p.goals.find((g) => g.period)?.period;
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>Goals</h2>{card(p, "goals")}{period && <span className="muted small">{period}</span>}</div>
      {p.goals.length === 0 ? <EmptyState icon="target" title="No goals yet" hint="Goals set in Keyflow show up here after the next sync." /> : (
        <ul className="list">
          {p.goals.map((g) => {
            const [tone, label] = GOAL_CHIP[g.status];
            return <li key={g.id} className="pinnable"><div className="l"><div>{g.title}<small>{g.dueOn ? `Due ${shortDate(g.dueOn)}, ` : ""}{g.progress}%</small></div></div><span className={`chip ${tone}`}>{label}</span>{record(p, `goal ${g.title}`, g.id)}</li>;
          })}
        </ul>
      )}
    </div>
  );
}

export function ReviewsCard({ p, reviews }: P & { reviews: ReviewScore[] | null }) {
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>Review scores</h2>{card(p, "review scores")}</div>
      {!reviews ? <p className="muted"><Masked masked /> Review scores show only to HR, leadership, the person and their manager.</p>
        : reviews.length === 0 ? <EmptyState icon="chart" title="No review scores yet" hint="Scores from Keyflow review cycles show up here." /> : (
          <ul className="list">
            {reviews.map((r) => <li key={r.id} className="pinnable"><div className="l"><div>{r.cycle}<small>{r.rating ?? "No rating"}</small></div></div><b>{r.score} of {r.scale}</b>{record(p, r.cycle, r.id)}</li>)}
          </ul>
        )}
    </div>
  );
}

export function RecognitionCard({ p }: P) {
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>Recognition</h2>{card(p, "recognition")}</div>
      {p.recognition.length === 0 ? <EmptyState icon="spark" title="No recognition yet" hint="Recognition given in Keyflow shows up here." /> : (
        <ul className="feed">
          {p.recognition.map((k) => <li key={k.id} className="pinnable"><span className={`av ${avatar(k.fromName)}`} aria-hidden="true">{initials(k.fromName)}</span><div><p>{k.message}</p><small>{k.fromName}, {shortDate(k.givenOn)}</small></div>{record(p, `recognition from ${k.fromName}`, k.id)}</li>)}
        </ul>
      )}
    </div>
  );
}
