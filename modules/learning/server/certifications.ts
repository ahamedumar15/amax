import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService, type Emitted, type ServiceContext } from "@amax/core/server";
import { getPerson } from "@amax/hr/contracts";
import { dayOf, EVENTS, type CertificationExpiring, type CertificationRecorded } from "../contracts";
import { day } from "./programmes";
import { actorOf, today } from "./read";

/** Days before an expiry that the daily sweep reminds at: two months out, then two weeks. */
export const WINDOWS = [60, 14] as const;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);

export const recordCertification = defineService({
  name: "learning.certification.record",
  action: "learning:certification:record",
  resource: "learning.certification",
  input: z.object({ employeeNo: z.string().trim().min(1).max(20), name: z.string().trim().min(1).max(160), issuer: z.string().trim().max(120).optional(),
    issuedOn: day, expiresOn: day.optional(), programmeId: z.string().uuid().optional() })
    .refine((c) => !c.expiresOn || c.expiresOn > c.issuedOn, { message: "it must expire after it was issued", path: ["expiresOn"] }),
  async run(tx, input, ctx) {
    const person = await getPerson(tx, ctx, input.employeeNo);
    if (!person) throw new Error(`no person ${input.employeeNo} that you can see in HR`);
    const [c] = await tx.execute(sql`insert into learning.certification (tenant_id, person_id, name, issuer, programme_id, issued_on, expires_on, recorded_by)
      values (${ctx.tenantId}, ${person.id}, ${input.name}, ${input.issuer ?? null}, ${input.programmeId ?? null}, ${input.issuedOn}, ${input.expiresOn ?? null}, ${actorOf(ctx)}) returning id`);
    const payload: CertificationRecorded = { certificationId: c.id as string, personId: person.id, name: input.name, expiresOn: input.expiresOn ?? null, by: actorOf(ctx) };
    return { result: { id: c.id as string }, resourceId: c.id as string, after: input, events: [{ name: EVENTS.certificationRecorded, payload }] };
  },
});

async function remind(tx: Tx, ctx: ServiceContext, c: Record<string, unknown>, on: string, kind: "scheduled" | "manual", windowDays: number | null): Promise<Emitted | null> {
  const expiresOn = dayOf(c.expires_on)!;
  const [r] = await tx.execute(sql`insert into learning.reminder (tenant_id, certification_id, expires_on, kind, window_days, requested_by)
    values (${ctx.tenantId}, ${c.id}, ${expiresOn}, ${kind}, ${windowDays}, ${actorOf(ctx)}) on conflict do nothing returning id`);
  if (!r) return null;
  const holder = await getPerson(tx, ctx, c.person_id as string);
  const payload: CertificationExpiring = { certificationId: c.id as string, personId: c.person_id as string, userId: holder?.userId ?? null, name: c.name as string, expiresOn, daysLeft: daysBetween(on, expiresOn), kind, by: actorOf(ctx) };
  return { name: EVENTS.certificationExpiring, payload };
}

/** A person asks for a reminder now: one more message, on top of the scheduled ones. */
export const remindCertification = defineService({
  name: "learning.certification.remind",
  action: "learning:remind",
  resource: "learning.certification",
  input: z.object({ certificationId: z.string().uuid() }),
  async run(tx, input, ctx) {
    const on = today();
    const [c] = await tx.execute(sql`select * from learning.certification where id = ${input.certificationId}`);
    if (!c) throw new Error("no such certification");
    if (!c.expires_on || dayOf(c.expires_on)! < on) throw new Error(c.expires_on ? "that certification has already expired" : "that certification doesn't expire");
    if (!(await getPerson(tx, ctx, c.person_id as string))) throw new Error("no such certification");
    const event = (await remind(tx, ctx, c, on, "manual", null))!;
    return { result: { certificationId: c.id as string, daysLeft: daysBetween(on, dayOf(c.expires_on)!) }, resourceId: c.id as string, after: { kind: "manual" }, events: [event] };
  },
});

/** The daily sweep: each certification inside a window gets that window's reminder once. */
export const remindDue = defineService({
  name: "learning.certification.remind_due",
  action: "learning:remind",
  resource: "learning.reminder",
  input: z.object({ on: day }),
  async run(tx, input, ctx) {
    const due = await tx.execute(sql`select * from learning.certification where expires_on >= ${input.on}::date and expires_on <= ${input.on}::date + ${WINDOWS[0]}::int order by expires_on`);
    const events: Emitted[] = [];
    for (const c of due) {
      const left = daysBetween(input.on, dayOf(c.expires_on)!);
      const window = Math.min(...WINDOWS.filter((w) => left <= w));
      const e = await remind(tx, ctx, c, input.on, "scheduled", window);
      if (e) events.push(e);
    }
    return { result: { sent: events.length }, resourceId: null, after: { on: input.on, sent: events.length }, events };
  },
});
