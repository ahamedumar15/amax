import type { Viewer } from "@amax/auth";
import type { CareerEvent } from "../contracts";
import { careerData, type CareerData } from "./career";
import { read } from "./read";
import { rowsOf, spanOf, traceView, type Row, type TraceView } from "./rows";

export type Career = CareerData & { rows: Row[] };
export type CareerEventView = { person: CareerData["person"]; event: CareerEvent; row: Row; trace: TraceView };

const lastOn = (e: CareerEvent, today: string) => (e.kind === "project" ? spanOf(e, today).to ?? today : e.on);

/** The career the screen draws, with its rows; `since` keeps what happened from that day on (AC-5). */
export async function getCareer(viewer: Viewer, a: { personId?: string; employeeNo?: string; since?: string }): Promise<Career | null> {
  return read(viewer, async (tx) => {
    const d = await careerData(tx, viewer, viewer.tenantId, a.personId ?? a.employeeNo ?? "");
    if (!d) return null;
    const events = a.since ? d.events.filter((e) => lastOn(e, d.today) >= a.since!) : d.events;
    return { ...d, events, rows: rowsOf(events, d.today) };
  });
}

/** One event by its id, with its trace: what a pin on a node or a row resolves to (AC-4). */
export async function getCareerEvent(viewer: Viewer, a: { personId: string; eventId: string }): Promise<CareerEventView | null> {
  const career = await getCareer(viewer, { personId: a.personId });
  const event = career?.events.find((e) => e.id === a.eventId);
  if (!career || !event) return null;
  return { person: career.person, event, row: career.rows.find((r) => r.id === event.id)!, trace: traceView(event, career.events, career.today) };
}
