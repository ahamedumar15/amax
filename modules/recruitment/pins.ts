import type { PinnedRecord } from "@amax/core";
import type { PinRef } from "@amax/ui";

// Recruitment pins name a record by its id (059); the label comes from the record as the viewer reads
// it, so a pin made by someone without the candidate class never carries a candidate's name.
type AppLike = { id: string; name: unknown; roleTitle: string };
type RoleLike = { id: string; title: string };
export const appLabel = (a: AppLike) => (typeof a.name === "string" ? `${a.name}, ${a.roleTitle} application` : `${a.roleTitle} applicant`);
export const appPin = (a: AppLike): PinRef => ({ label: appLabel(a), tool: "get_application", args: { applicationId: a.id } });
export const rolePin = (r: RoleLike): PinRef => ({ label: `${r.title} role`, tool: "get_role", args: { roleId: r.id } });
/** A stat, a stage, a funnel step or a month of the screen (for one role when `roleId` is set): resolves to the pipeline it counts. */
export const viewPin = (label: string, roleId?: string): PinRef => ({ label, tool: "list_recruitment", args: roleId ? { roleId } : {} });

export const appOf = (a: AppLike | null): PinnedRecord | null => (a ? { id: a.id, label: appLabel(a) } : null);
export const roleOf = (r: RoleLike | null): PinnedRecord | null => (r ? { id: r.id, label: `${r.title} role` } : null);
