import { canEver } from "@amax/auth";
import type { ScreenProps } from "@amax/core";
import { IntentButton } from "@amax/ui";
import { listCertifications, listProgrammes } from "../server/queries";
import { today, yearOf } from "../server/read";
import { learningStats, type LearningStats } from "../server/stats";
import { needViewer, plural, SignInFirst, beforeNextYear } from "./parts";
import { ProgrammesCard } from "./ProgrammesCard";
import { TakingPartCard } from "./TakingPartCard";
import { Tickets } from "./Tickets";

function lede(s: LearningStats, on: string) {
  const mandatory = s.mandatory.map((m) => m.completed >= s.headcount ? `All ${s.headcount} people did the mandatory ${m.title} course` : `${m.completed} of ${s.headcount} people did the mandatory ${m.title} course`);
  const optional = `${plural(s.optional.people, "person", "people")} (${s.optional.share}%) took part in optional programmes`;
  const first = mandatory.length ? `${mandatory.join(". ")}, and ${optional}.` : `${optional.charAt(0).toUpperCase()}${optional.slice(1)}.`;
  const n = s.certifications.expiringThisYear;
  return `${plural(s.programmes.total, "programme")} this year. ${first} ${n ? `${plural(n, "certification")} expire${n === 1 ? "s" : ""} ${beforeNextYear(on)}.` : `No certification expires ${beforeNextYear(on)}.`}`;
}

export async function LearningPage({ viewer: raw }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Learning and development</h1><SignInFirst /></>;
  const on = today();
  const [s, rows, expiring] = await Promise.all([learningStats(viewer, on), listProgrammes(viewer, on), listCertifications(viewer, { on, until: yearOf(on).to })]);
  return (
    <div className="learning">
      <div className="row head">
        <div><h1>Learning and development</h1><p className="lede">{lede(s, on)}</p></div>
        {canEver(viewer, "learning:programme:create") && <div className="actions"><IntentButton intent="learning.new-programme" label="New programme" /></div>}
      </div>
      <Tickets s={s} on={on} />
      <div className="cols">
        <ProgrammesCard rows={rows} />
        <TakingPartCard s={s} expiring={expiring} on={on} canRemind={canEver(viewer, "learning:remind")} />
      </div>
    </div>
  );
}
