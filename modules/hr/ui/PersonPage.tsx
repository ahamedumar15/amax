import { notFound } from "next/navigation";
import type { ScreenProps } from "@amax/core";
import { Card, EmptyState, PinButton } from "@amax/ui";
import { today } from "../server/inforce";
import { getPersonView } from "../server/queries";
import { DocumentsCard } from "./DocumentsCard";
import { EmploymentCard } from "./EmploymentCard";
import { avClass, countryName, longDate, needViewer, SignInFirst, statusChip } from "./parts";

export async function PersonPage({ params, viewer: raw }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Person</h1><SignInFirst /></>;
  const on = today();
  const view = await getPersonView(viewer, params.employeeNo, on);
  if (!view) notFound();
  const { person: p } = view;
  const [tone, label] = statusChip(p, on);
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><a href="/hr">People</a><span aria-hidden="true">/</span>{p.name}</nav>
      <div className="profile">
        <div className="card idcard pinnable">
          <span className={`av lg ${avClass(p.name)}`} style={{ width: 88, height: 88, borderRadius: 28, fontSize: 26 }} aria-hidden="true">{p.initials}</span>
          <h1>{p.name}</h1><span className="muted" style={{ fontSize: 14 }}>{p.title}</span>
          <div className="chips"><span className={`chip ${tone}`}>{label}</span><span className="chip">{countryName(p.country, p.entityName)}</span><PinButton inline pin={{ label: p.name, tool: "get_person", args: { employeeNo: p.employeeNo } }} /></div>
          <dl className="kv">
            <dt>Employee no.</dt><dd>{p.employeeNo}</dd>
            <dt>Joined</dt><dd>{longDate(p.joinedOn)}</dd>
            <dt>Manager</dt><dd>{p.managerName ?? "–"}</dd>
            <dt>Department</dt><dd>{p.department ?? "–"}</dd>
            <dt>Work email</dt><dd>{view.workEmail ?? "–"}</dd>
            <dt>Location</dt><dd>{view.location ?? "–"}</dd>
          </dl>
        </div>
        <div className="stack">
          <nav className="tabs" aria-label="Sections">
            <a className="btn sm" href="#employment" aria-current="true">Employment</a>
            <a className="btn sm" href="#documents">Documents</a><a className="btn sm" href="#leave">Leave</a>
          </nav>
          <div className="cols even">
            <EmploymentCard e={view.employment} probationEnds={p.probationEnds} employeeNo={p.employeeNo} name={p.name} />
            <DocumentsCard docs={view.documents} employeeNo={p.employeeNo} name={p.name} />
          </div>
          <div className="cols even">
            <div id="leave"><Card title="Leave balance" actions={<PinButton inline pin={{ label: `${p.name}, leave`, tool: "get_person", args: { employeeNo: p.employeeNo } }} />}><EmptyState icon="calendar" title="No leave balances yet" hint="Balances show here once the Leave module is installed." /></Card></div>
          </div>
        </div>
      </div>
    </>
  );
}
