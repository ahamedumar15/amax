import type { ScreenProps } from "@amax/core";
import { canEver } from "@amax/auth";
import { IntentButton } from "@amax/ui";
import { viewPin } from "../pins";
import { ledeOf } from "../server/phrases";
import { FIX, PULSE } from "../server/read";
import { experienceView, type ExperienceView } from "../server/views";
import { ART_SPRITE } from "./art";
import { AskButton } from "./AskButton";
import { Fixes } from "./Fixes";
import { Groups } from "./Groups";
import { SignInFirst, viewerOrNull } from "./parts";
import { Collect, Pulse } from "./Side";
import { Tiles } from "./Tiles";

/** What needs attention first: the group that fell most, then the largest fix waiting. */
export function lede(v: ExperienceView) {
  if (!v.collection.entities) return "Collection is off: an Admin switches it on per legal entity once the notice to staff has gone out.";
  const first = v.dropped ? `Experience dipped to ${v.dropped.score.toFixed(1)} in ${v.dropped.group} over the last 4 weeks.` : `Experience is ${v.all.score.toFixed(1)} out of 10 across ${v.all.people} people.`;
  const fix = v.fixes.find((f) => f.status === "open");
  return `${first} ${fix ? ledeOf(fix, v.today) : "No fix is waiting."}`;
}

export async function ExperiencePage({ viewer: raw, searchParams }: ScreenProps) {
  const viewer = viewerOrNull(raw);
  if (!viewer) return <div className="experience"><h1>Digital experience</h1><SignInFirst /></div>;
  const v = await experienceView(viewer, searchParams?.by);
  return (
    <div className="experience">
      <div dangerouslySetInnerHTML={{ __html: ART_SPRITE }} />
      <div className="row head">
        <div><h1>Digital experience</h1><p className="lede">{lede(v)}</p></div>
        <div className="actions">
          {canEver(viewer, PULSE) && <IntentButton intent="experience.send-pulse" label="Send pulse survey" primary={false} />}
          {canEver(viewer, FIX) && <AskButton className="btn primary" label="Review fixes" prompt="Show the experience agent's open fixes with their evidence, so I can accept or dismiss each." pin={viewPin("Suggested fixes")} />}
        </div>
      </div>
      <Tiles v={v} />
      <div className="cols">
        <Groups v={v} />
        <div className="stack">
          <Fixes v={v} />
          <Pulse v={v} />
          <Collect v={v} />
        </div>
      </div>
    </div>
  );
}
