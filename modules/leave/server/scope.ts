import { can, canEver, canSee, mask, ScopeError, type Viewer } from "@amax/auth";
import { isSystemContext, type ServiceContext } from "@amax/core/server";

/** 002 classes of a request's classified fields: HR and the person only. */
export const LEAVE_SENSITIVE = { medicalReason: "health", certificateRef: "health" } as const;

/** Who reads: a signed-in viewer, or a ServiceContext (a system job, or a call acting for a viewer). */
export type Reader = Viewer | ServiceContext;
export type Resolved = { kind: "viewer"; viewer: Viewer } | { kind: "system" };

/** A ServiceContext reads as its viewer; without one only a context core issued with contextFor.job may read. Fails closed. */
export function readerOf(r: Reader): Resolved {
  if (!("actor" in r)) return { kind: "viewer", viewer: r };
  if (r.viewer) return { kind: "viewer", viewer: r.viewer as Viewer };
  if (isSystemContext(r)) return { kind: "system" };
  throw new ScopeError("leave:read");
}

type Row = Record<string, unknown>;
const subject = (row: Row) => ({ ownerUserId: (row.user_id as string | null) ?? null, legalEntityId: row.legal_entity_id as string });

/** A person sees their own leave, their reports' leave, and everyone's in the entities their leave:team reaches. */
export const sees = (v: Viewer, row: Row) => {
  const owner = row.user_id as string | null;
  return (!!owner && (owner === v.userId || v.reports.includes(owner))) || can(v, "leave:team", { legalEntityId: row.legal_entity_id as string });
};

export const visibleTo = (r: Resolved, row: Row) => r.kind === "system" || sees(r.viewer, row);

export type Chain = "manager" | "hr";

/** Who may decide a request: never its owner; HR (leave:admin) for the entity, or the person's manager. */
export function chainFor(v: Viewer | undefined, row: Row): Chain | null {
  const owner = (row.user_id as string | null) ?? null;
  if (!v || (owner && owner === v.userId)) return null;
  if (can(v, "leave:admin", { legalEntityId: row.legal_entity_id as string })) return "hr";
  if (owner && v.reports.includes(owner) && canEver(v, "leave:approve")) return "manager";
  return null;
}

/** Medical reasons and certificates (002 health): HR and the person only. */
export const maskHealth = <T extends Row>(v: Viewer, row: Row, out: T) => mask(v, out, LEAVE_SENSITIVE as Partial<Record<keyof T & string, "health">>, subject(row));
export const seesHealth = (v: Viewer, row: Row) => canSee(v, "health", subject(row));
