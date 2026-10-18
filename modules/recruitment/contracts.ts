// The only import surface for other modules (docs/module-standard.md). Reads run in the caller's
// tenant transaction and never return candidate data: other modules get open roles and their size.
// E-signature providers (Zoho Sign first) plug in through `registerSignProvider`.
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { isSystemContext, type ServiceContext } from "@amax/core/server";

export { registerSignProvider, signProviders, type Envelope, type EnvelopeStatus, type SignProvider } from "./sign";

/** An application's stages, in order (023 AC-1). Rejected and withdrawn close it. */
export const STAGES = ["applied", "screening", "interview", "offer", "hired"] as const;
export type Stage = (typeof STAGES)[number] | "rejected" | "withdrawn";
export const STAGE_LABELS: Record<(typeof STAGES)[number], string> = {
  applied: "Applied", screening: "Screening", interview: "Interviews", offer: "Offer", hired: "Hired this quarter",
};

/** Every candidate field the reads return, 002 class `candidate`: only HR sees them. */
export const CANDIDATE_FIELDS = { name: "candidate", initials: "candidate", email: "candidate", cv: "candidate", evidence: "candidate" } as const;

export const EVENTS = {
  roleOpened: "recruitment.role.opened",
  applicationReceived: "recruitment.application.received",
  offerSent: "recruitment.offer.sent",
  hired: "recruitment.hired",
  hireConfirmed: "recruitment.hire.confirmed",
} as const;

/** No event carries a candidate's name or CV: ids, the role and the entity only. */
export type RoleOpened = { roleId: string; legalEntityId: string; title: string; openings: number; by: string };
export type ApplicationReceived = { applicationId: string; roleId: string; legalEntityId: string; by: string };
export type OfferSent = { applicationId: string; offerId: string; legalEntityId: string; provider: string; by: string };
export type Hired = { applicationId: string; roleId: string; legalEntityId: string; startsOn: string; by: string };
export type HireConfirmed = Hired & { confirmedBy: string };

export type RoleRef = { id: string; title: string; department: string; legalEntityId: string; openings: number; raisedByAgent: boolean; reason: string | null };

type Reader = Viewer | ServiceContext;
const viewerOf = (r: Reader): Viewer | null => ("actor" in r ? ((r.viewer as Viewer | undefined) ?? null) : r);
function mayRead(r: Reader, legalEntityId: string) {
  const v = viewerOf(r);
  if (!v) return "actor" in r && isSystemContext(r);
  return can(v, "recruitment:read", { legalEntityId });
}

/** Open roles the reader may see, oldest first: title, department, openings and who raised them. */
export async function listOpenRoles(tx: Tx, reader: Reader): Promise<RoleRef[]> {
  const rows = await tx.execute(sql`select * from recruitment.role where status = 'open' order by opened_at, title`);
  return rows.filter((r) => mayRead(reader, r.legal_entity_id as string)).map((r) => ({
    id: r.id as string, title: r.title as string, department: r.department as string, legalEntityId: r.legal_entity_id as string,
    openings: Number(r.openings), raisedByAgent: String(r.raised_by).startsWith("job:") || String(r.raised_by).startsWith("agent:"), reason: (r.reason as string | null) ?? null,
  }));
}
