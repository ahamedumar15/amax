import type { ScreenProps } from "@amax/core";
import { viewPin } from "../pins";
import { filterOf } from "../server/filters";
import { accessView, type AccessView } from "../server/view";
import { AskButton } from "./AskButton";
import { Licences } from "./Licences";
import { needViewer, plural, SignInFirst } from "./parts";
import { People } from "./People";
import { Devices, Savings, Spend } from "./Side";
import { Tiles } from "./Tiles";

const lede = (v: AccessView) => `What everyone can sign in to, from Microsoft Entra ID, Azure DevOps, Intune and your SaaS tools. ${
  v.totals.unused ? `${plural(v.totals.unused, "seat has", "seats have")} gone unused for 60 days.` : "Every seat was used in the last 60 days."}`;

// 021 T1: the stats lead, then licences and the licence agent's savings (what needs a decision),
// devices, and people with their access. Every tile, row and card is pinned; writes go through Ask amax.
export async function AccessPage({ viewer: raw, searchParams }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Access and licences</h1><SignInFirst /></>;
  const v = await accessView(viewer, filterOf(searchParams?.people));
  return (
    <div className="it-access">
      <div className="row head">
        <div><h1>Access and licences</h1><p className="lede">{lede(v)}</p>
          {!v.pricing && <p className="note">Licence prices are shown to Admin only; you see seats and use.</p>}</div>
        <div className="actions">
          <AskButton className="btn" label="Start access review" pin={viewPin("People and access")} name="Start access review, ask amax"
            prompt="Start an access review: list everyone with admin roles and contractors whose access ends soon, and record each review I confirm" />
          <AskButton className="btn primary" label="Add licence" pin={viewPin("Licences")} name="Add licence, ask amax"
            prompt="Give someone a licence: ask me for the person and the product, then send it to IT to approve" />
        </div>
      </div>
      <Tiles v={v} />
      <div className="cols">
        <Licences v={v} />
        <div className="stack"><Spend v={v} /><Savings v={v} /><Devices v={v} /></div>
      </div>
      <People v={v} all={searchParams?.all === "1"} />
    </div>
  );
}
