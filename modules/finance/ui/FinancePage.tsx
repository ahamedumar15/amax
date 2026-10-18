import type { ScreenProps } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { Card, EmptyState, PinButton } from "@amax/ui";
import { viewPin } from "../pins";
import { ART_SPRITE } from "./art";
import { getFinancials } from "../server/view";
import { Cards } from "./Cards";
import { Contracts } from "./Contracts";
import { Tiles } from "./Tiles";
import "./finance.css";

export async function FinancePage({ viewer, searchParams }: ScreenProps) {
  const v = (viewer as Viewer | null) ?? null;
  if (!v) return <><h1>Financials</h1><Card><EmptyState icon="wallet" title="Sign in to see financials" hint="Contracts and invoices come from the database once you're signed in." /></Card></>;
  const f = await getFinancials(v);
  if (!f) return <div className="finance"><h1>Financials</h1><div className="card pinnable"><PinButton pin={viewPin("Financials")} /><p className="empty-line">No contracts you can see yet. Finance adds one through amax.</p></div></div>;
  const kind = searchParams?.kind;
  return (
    <div className="finance">
      <div dangerouslySetInnerHTML={{ __html: ART_SPRITE }} />
      <h1>Financials</h1>
      <p className="lede">{f.lede}</p>
      <Tiles f={f} />
      <Cards f={f} />
      <Contracts f={f} rows={kind ? f.contracts.filter((c) => c.kind === kind) : f.contracts} />
    </div>
  );
}
