import { PinButton } from "@amax/ui";
import { reportPin } from "../pins";
import { availabilityCsv, utilisationCsv } from "../server/csv";
import type { Report } from "../server/view";
import { AvailabilityTable } from "./AvailabilityTable";
import { ExportLink } from "./parts";
import { Tabs } from "./Tabs";
import { UtilisationTable } from "./UtilisationTable";
import type { ViewKey } from "./views";

export function ReportCard({ r, view }: { r: Report; view: ViewKey }) {
  const utilisation = view === "utilisation";
  const pin = reportPin(utilisation ? `Utilisation table, ${r.monthName}` : `Availability, rest of ${r.monthName}`, r.month);
  return (
    <section className="card flush pinnable" aria-label={utilisation ? "Utilisation per person" : "Availability per person"}>
      <div className="card-head">
        <Tabs current={view} />
        <div className="actions">
          {utilisation
            ? <ExportLink filename={`utilisation-${r.month}.csv`} csv={utilisationCsv(r)} />
            : <ExportLink filename={`availability-${r.month}.csv`} csv={availabilityCsv(r.availability)} />}
        </div>
        <PinButton pin={pin} />
      </div>
      {utilisation ? <UtilisationTable r={r} /> : <AvailabilityTable r={r} />}
    </section>
  );
}
