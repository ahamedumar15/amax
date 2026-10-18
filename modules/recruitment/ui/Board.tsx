import { PinButton } from "@amax/ui";
import { viewPin } from "../pins";
import type { PipelineView } from "../server/queries";
import { AppCard } from "./Card";

const ICON: Record<string, [string, string]> = {
  applied: ["#5CC8F0", "M4 13h4l2 3h4l2-3h4M5 5h14l1 8v6H4v-6z"],
  screening: ["#7B61FF", "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"],
  interview: ["#F2A93B", "M5 18V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9l-4 3z"],
  offer: ["#F48B9B", "M3 7l9 6 9-6M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"],
  hired: ["#2FCB8C", "M4 20 9 7l8 8zM14 4v2M19 9h2M17 5l-1 1M20 13l-2-1"],
};

// The pipeline: what is in each stage now. The first stage shows two cards, the rest one, then
// "+N more", which opens that stage in full (?lane=).
export function Board({ p, open }: { p: PipelineView; open?: string }) {
  const roleId = p.role?.id;
  const href = (stage: string) => `/recruitment?${new URLSearchParams({ ...(roleId ? { role: roleId } : {}), lane: stage })}`;
  return (
    <div className="board">
      {p.lanes.map((l) => {
        const shown = open === l.stage ? l.cards : l.cards.slice(0, l.stage === "applied" ? 2 : 1);
        const [color, d] = ICON[l.stage];
        return (
          <section key={l.stage} className="lane" aria-label={`${l.label}: ${l.count}`}>
            <PinButton pin={viewPin(`${l.label} stage`, roleId)} />
            <div className="lane-head"><span className="lh"><span className="stk" style={{ "--c": color } as never}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg></span>{l.label}</span> <span>{l.count}</span></div>
            {shown.map((a) => <AppCard key={a.id} a={a} />)}
            {l.count > shown.length && <a className="more" href={`${href(l.stage)}#${l.stage}`} id={l.stage}>+{l.count - shown.length} more</a>}
          </section>
        );
      })}
    </div>
  );
}
