import { withTenant, type Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime } from "@amax/core/server";

export const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!can(viewer, "presales:read")) throw new ForbiddenError("presales:read", "presales");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

export const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(v as string).toISOString());
export const isoDay = (v: unknown) => (v === null || v === undefined ? null : typeof v === "string" ? v.slice(0, 10) : new Date(v as Date).toISOString().slice(0, 10));
export const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
