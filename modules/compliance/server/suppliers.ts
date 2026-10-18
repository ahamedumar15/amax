import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService, type ServiceContext } from "@amax/core/server";
import { EVENTS, type SupplierChanged } from "../contracts";
import { by, day, isoDate, type Row } from "./context";
import { toSupplier } from "./supplier-read";

const changed = (r: Row, ctx: ServiceContext): SupplierChanged => ({ supplierId: r.id as string, name: r.name as string, subprocessor: Boolean(r.subprocessor), status: r.status as string, by: by(ctx) });
const fields = { service: z.string().optional(), data: z.string().optional().describe("What data the supplier holds or processes"), region: z.string().optional(),
  subprocessor: z.boolean().optional().describe("Processes personal data for us"), dpaSignedOn: isoDate.optional(), reviewOn: isoDate.optional() };

export const addSupplier = defineService({
  name: "compliance.supplier.create", action: "compliance:manage", resource: "compliance.supplier",
  input: z.object({ name: z.string().min(2), ...fields, service: z.string().min(2) }),
  async run(tx, a, ctx) {
    const [r] = await tx.execute(sql`insert into compliance.supplier (tenant_id, name, service, data, region, subprocessor, dpa_signed_on, review_on, added_by)
      values (${ctx.tenantId}, ${a.name}, ${a.service}, ${a.data ?? null}, ${a.region ?? null}, ${a.subprocessor ?? true}, ${a.dpaSignedOn ?? null}, ${a.reviewOn ?? null}, ${by(ctx)})
      on conflict (tenant_id, name) do nothing returning *`);
    if (!r) throw new Error(`${a.name} is already in the supplier register`);
    return { result: toSupplier(r), resourceId: r.id as string, after: { name: a.name, subprocessor: r.subprocessor }, events: [{ name: EVENTS.supplierChanged, payload: changed(r, ctx) }] };
  },
});

export const updateSupplier = defineService({
  name: "compliance.supplier.update", action: "compliance:manage", resource: "compliance.supplier",
  input: z.object({ supplierId: z.string().uuid(), ...fields, status: z.enum(["active", "ended"]).optional() }),
  async run(tx, a, ctx) {
    const [was] = await tx.execute(sql`select * from compliance.supplier where id = ${a.supplierId} for update`);
    if (!was) throw new Error("no such supplier");
    const [r] = await tx.execute(sql`update compliance.supplier set service = ${a.service ?? was.service}, data = ${a.data ?? was.data}, region = ${a.region ?? was.region},
      subprocessor = ${a.subprocessor ?? was.subprocessor}, dpa_signed_on = ${a.dpaSignedOn ?? day(was.dpa_signed_on)}, review_on = ${a.reviewOn ?? day(was.review_on)},
      status = ${a.status ?? was.status}, updated_at = now() where id = ${a.supplierId} returning *`);
    return { result: toSupplier(r), resourceId: a.supplierId, before: { status: was.status, subprocessor: was.subprocessor }, after: { status: r.status, subprocessor: r.subprocessor },
      events: [{ name: EVENTS.supplierChanged, payload: changed(r, ctx) }] };
  },
});
