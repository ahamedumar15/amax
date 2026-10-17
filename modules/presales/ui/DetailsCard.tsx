import type { ReactNode } from "react";
import { PinButton } from "@amax/ui";
import type { OpportunityRow } from "../server/queries";
import { initials, longDay, money, oppPin, usd } from "./parts";

const HEALTH: Record<string, [string, string, string]> = {
  green: ["good", "Health: green", "Calculated, not typed: no high-impact risk or issue is open."],
  amber: ["warn", "Health: amber", "Calculated, not typed: a high-impact risk or an issue is open."],
  red: ["bad", "Health: red", "Calculated, not typed: a high-impact issue is open."],
};
const COUNTRY: Record<string, string> = { AU: "Australia", US: "United States", LK: "Sri Lanka", GB: "United Kingdom", NZ: "New Zealand" };

const Who = ({ name }: { name: string }) => <span className="who"><span className="av sm a2" aria-hidden="true">{initials(name)}</span>{name}</span>;

export function DetailsCard({ o }: { o: OpportunityRow }) {
  const [chip, label, why] = HEALTH[o.health];
  const closed = o.stage === "won" || o.stage === "lost";
  const rows: [string, ReactNode][] = [
    ["Client", o.country ? `${o.client}, ${COUNTRY[o.country] ?? o.country}` : o.client],
    ...(o.ownerName ? [["Account manager", <Who key="o" name={o.ownerName} />] as [string, ReactNode]] : []),
    ...(o.leadName ? [["Presales lead", <Who key="l" name={o.leadName} />] as [string, ReactNode]] : []),
    ...(o.service ? [["Service", o.service] as [string, string]] : []),
    ...(o.costCentre ? [["Cost centre", o.costCentre] as [string, string]] : []),
    ["Value", o.valueCurrency === "USD" ? `USD ${Math.round(o.valueAmount).toLocaleString("en-US")}` : `${money(o.valueAmount, o.valueCurrency)} (${usd(o.valueUsd)} at ${o.usdRate})`],
    ...(o.estimateDays !== null ? [["Estimate", `${o.estimateDays} person-days`] as [string, string]] : []),
    ...(o.expectedClose ? [["Expected close", longDay(o.expectedClose)] as [string, string]] : []),
    ...(o.leadSource ? [["Lead source", o.leadSource] as [string, string]] : []),
    ...(o.competing ? [["Competing with", o.competing] as [string, string]] : []),
    ...(o.stage === "lost" ? [["Lost because", [o.lostReason, o.lostCompetitor].filter(Boolean).join(", ")] as [string, string]] : []),
  ];
  return (
    <div className="card pinnable" id="details">
      <PinButton pin={{ ...oppPin(o), label: `${o.number} details` }} />
      <div className="card-head"><h2>Details</h2>{!closed && <span className={`chip ${chip}`}>{label}</span>}</div>
      {!closed && <p className="src calc">{why}</p>}
      <dl className="kv">{rows.map(([k, v]) => <div className="kv-row" key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </div>
  );
}
