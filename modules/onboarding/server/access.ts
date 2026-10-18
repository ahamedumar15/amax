import type { Emitted } from "@amax/core/server";
import type { PersonRef } from "@amax/hr/contracts";
import { EVENTS, type AccessKind, type AccessRequested, type ChecklistKind } from "../contracts";
import { addDays } from "./read";

// 013 AC-2: IT access is only ever suggested. A joiner's checklist asks for a grant the day before they
// start, a leaver's for a revoke on their last day: an `onboarding.access.requested` event for 021
// (it-access) to turn into a suggestion IT approves, and an IT Admin task that carries it until 021 is
// installed. Nothing here, or in completing the task, grants or revokes anything.
export const accessKindOf = (kind: ChecklistKind): AccessKind => (kind === "joiner" ? "grant" : "revoke");

export const ACCESS_TASK: Record<AccessKind, string> = {
  grant: "Grant sign-in, email and licences",
  revoke: "Revoke sign-in, email and licences",
};

export function accessTask(kind: ChecklistKind, startsOn: string) {
  const access = accessKindOf(kind);
  return { title: ACCESS_TASK[access], owner: "ITAdmin" as const, ownerUserId: null, access, dueOn: kind === "joiner" ? addDays(startsOn, -1) : startsOn };
}

export function accessRequested(p: PersonRef, kind: ChecklistKind): Emitted {
  const payload: AccessRequested = { personId: p.id, userId: p.userId, kind: accessKindOf(kind), legalEntityId: p.legalEntityId };
  return { name: EVENTS.accessRequested, payload };
}
