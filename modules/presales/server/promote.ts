import { z } from "zod";
import { withTenant } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime, logError, retryable, withIdempotency, type Source } from "@amax/core/server";
import * as delivery from "@amax/delivery/contracts";
import { getOpportunityRef } from "../contracts";
import { claimPromotion, createKey, PromotionRefused, recordPromotion, releasePromotion } from "./claim";
import { NUMBER } from "./common";
import { ctxFor } from "./context";

export type ProjectInput = { key: string; name: string; client: string; billing: "fixed" | "t&m" | "retainer"; managerName?: string };
export type CreateProject = (ctx: ReturnType<typeof ctxFor>, input: ProjectInput) => Promise<{ id: string; key: string }>;

/** Delivery's published project creation, or null while its contract doesn't offer one. */
export function deliveryCreateProject(): CreateProject | null {
  const create = (delivery as unknown as Record<string, unknown>).createProject;
  return typeof create === "function" ? (create as CreateProject) : null;
}

export class PromotionUnavailableError extends Error {
  readonly retryable = false;
  constructor() {
    super("Delivery doesn't offer project creation through its contract yet, so this can't be promoted here");
    this.name = "PromotionUnavailableError";
  }
}

export const promoteInput = z.object({ number: z.string().regex(NUMBER), key: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/, "2–10 capitals or digits, e.g. NWI"), billing: z.enum(["fixed", "t&m", "retainer"]) });

/** A create's result, first time or replayed under its idempotency key: the project's id and key. */
const projectOf = (r: unknown, key: string) => {
  const v = r as { id?: string; resourceId?: string | null; key?: string | null };
  const id = v.id ?? v.resourceId;
  if (!id || v.key !== key) throw new PromotionRefused(`delivery's answer doesn't name project ${key}`);
  return { id, key: v.key };
};

/**
 * Promote to delivery: claim the opportunity, have delivery create the project through its contract
 * under the claim series' idempotency key, then link it. Whatever happens between the
 * create and the link (a crash, a timeout, a slow attempt overtaken), a retry with the same key gets
 * the same project back from delivery instead of making a second one.
 */
export async function promoteToDelivery(viewer: Viewer, raw: unknown, opts: { source?: Source; create?: CreateProject | null } = {}) {
  const create = opts.create === undefined ? deliveryCreateProject() : opts.create;
  if (!can(viewer, "presales:promote")) throw new ForbiddenError("presales:promote", "presales.opportunity");
  const input = promoteInput.parse(raw);
  if (!create) throw new PromotionUnavailableError();
  const ctx = ctxFor(viewer, opts.source);
  const db = getRuntime().db;
  const claim = await claimPromotion(ctx, { number: input.number, key: input.key, billing: input.billing });
  let made = false;
  try {
    const { opp, existing } = await withTenant(db, viewer.tenantId, async (tx) => ({ opp: (await getOpportunityRef(tx, input.number))!, existing: await delivery.getProjectRef(tx, input.key) }));
    if (existing && !claim.resumed) throw new Error(`delivery already has a project ${input.key}; choose another key`);
    const created = await withIdempotency(createKey(claim.series), () => create(ctx, { key: input.key, name: opp.title, client: opp.client, billing: input.billing }));
    if (!created.ok) throw created.error;
    made = true;
    const project = projectOf(created.value, input.key);
    return await recordPromotion(ctx, { number: input.number, token: claim.token, projectId: project.id, projectKey: project.key });
  } catch (e) {
    // Release in one transaction with the check that the series made nothing. A refusal every replay
    // would meet again (delivery's answer, a project another opportunity holds) frees the claim too.
    const lasting = made && !retryable(e);
    if (!made || lasting) await releasePromotion(ctx, { number: input.number, token: claim.token, force: lasting }).catch((r: unknown) => logError("presales.promote.release", r));
    throw e;
  }
}
