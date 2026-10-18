import { notFound } from "next/navigation";
import type { ScreenProps } from "@amax/core";
import { canEver, isMasked } from "@amax/auth";
import { PinButton, Ticket } from "@amax/ui";
import type { KeyflowProfile, ReviewScore } from "../contracts";
import { performanceView } from "../server/profile";
import { ago, plural, shortDate, SignInFirst, viewerOrNull } from "./parts";
import { GoalsCard, RecognitionCard, ReviewsCard } from "./ProfileCards";

const first = (name: string) => name.split(" ")[0];

function lede(p: KeyflowProfile, syncedAt: string | null) {
  const risk = p.goals.filter((g) => g.status === "at-risk" || g.status === "off-track").length;
  const lead = risk ? `${plural(risk, "goal")} ${risk === 1 ? "is" : "are"} at risk.` : p.goals.length ? "Every goal is on track." : "No goals in Keyflow yet.";
  return `${lead} Goals, review scores and recognition come from Keyflow${syncedAt ? `, synced ${ago(syncedAt)}` : ""}. Review scores show only to HR, leadership, ${first(p.name)} and their manager.`;
}

// The person page's Performance section (051): served at /hr/p/:employeeNo/performance.
export async function PerformancePage({ params, viewer: raw }: ScreenProps) {
  const viewer = viewerOrNull(raw);
  if (!viewer) return <div className="keyflow"><h1>Performance</h1><SignInFirst what="performance" /></div>;
  if (!canEver(viewer, "keyflow:profile")) notFound();
  const view = await performanceView(viewer, params.employeeNo);
  if (!view) notFound();
  const { profile: p, syncedAt } = view;
  const pin = (label: string) => <PinButton pin={{ label: `${p.name}, ${label}`, tool: "get_keyflow_profile", args: { personId: p.personId } }} />;
  const reviews = isMasked(p.reviews) ? null : (p.reviews as ReviewScore[]);
  const latest = reviews?.[0];
  const risk = p.goals.filter((g) => g.status === "at-risk" || g.status === "off-track").length;
  return (
    <div className="keyflow">
      <nav className="crumb" aria-label="Breadcrumb"><a href="/hr">People</a><span aria-hidden="true">/</span><a href={`/hr/p/${p.employeeNo}`}>{p.name}</a><span aria-hidden="true">/</span>Performance</nav>
      <div className="row head"><div><h1>{p.name}, performance</h1><p className="lede">{lede(p, syncedAt)}</p></div></div>
      <div className="tickets three">
        <Ticket tone="info" label="Goals" value={String(p.goals.length)} note={risk ? `${risk} at risk` : "None at risk"} art={pin("goals")} />
        <Ticket tone="good" label="Latest review" value={!reviews ? "Hidden" : latest ? `${latest.score} of ${latest.scale}` : "None yet"} note={!reviews ? "Hidden for your role" : latest ? `${latest.cycle.replace(/ review$/, "")}, ${(latest.rating ?? "").toLowerCase()}` : "No review in Keyflow"} art={pin("latest review")} />
        <Ticket tone="attention" label="Recognition" value={String(p.recognition.length)} note={p.recognition[0] ? `Latest ${shortDate(p.recognition[0].givenOn)}` : "None yet"} art={pin("recognition")} />
      </div>
      <div className="cols even section">
        <GoalsCard p={p} />
        <div className="stack"><ReviewsCard p={p} reviews={reviews} /><RecognitionCard p={p} /></div>
      </div>
    </div>
  );
}
