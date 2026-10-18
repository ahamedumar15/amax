import { facet, PinButton } from "@amax/ui";
import type { OpportunityRow, StageChangeRow } from "../server/queries";
import { LineChart } from "./LineChart";
import { day, oppPin } from "./parts";

export function WinCard({ o, history, today }: { o: OpportunityRow; history: StageChangeRow[]; today: string }) {
  const open = o.stage !== "won" && o.stage !== "lost";
  const points = [...history].reverse();
  const rising = history[0] ? history[0].toChance > (history[0].fromChance ?? 0) : false;
  return (
    <div className="card pinnable">
      <PinButton pin={facet(oppPin(o), ", win chance")} />
      <div className="card-head"><h2>Win chance</h2><span className={rising ? "up" : "muted"}>{rising ? "↑ " : ""}{o.winChance}%</span></div>
      <LineChart id="winChart" label="Win chance over time" width={340} height={180} max={100} step={50}
        labels={[...points.map((h) => day(h.at)), ...(open ? [day(today)] : [])]}
        series={[{ name: "Win chance", color: "#7B61FF", area: true, data: [...points.map((h) => h.toChance), ...(open ? [o.winChance] : [])] }]} />
    </div>
  );
}

export function NextStepCard({ o }: { o: OpportunityRow }) {
  if (!o.nextStep) return null;
  return <div className="card pinnable"><PinButton pin={facet(oppPin(o), ", next step")} /><div className="card-head"><h2>Next step</h2></div><p className="next-step">{o.nextStep}</p></div>;
}
