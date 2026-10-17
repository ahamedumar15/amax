import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { lockOpportunity, NUMBER } from "./common";

// Activities, tasks and risks hang off an opportunity. Risks feed its calculated health.
const number = z.string().regex(NUMBER);
const title = z.string().trim().min(1).max(200);
const person = z.string().trim().min(1).max(120).optional();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ACTIVITY_KINDS = ["call", "meeting", "workshop", "demo", "proposal", "email"] as const;
export const TASK_STATUSES = ["to-start", "in-progress", "on-hold", "done"] as const;
export const RISK_KINDS = ["risk", "issue", "assumption", "decision"] as const;
export const RISK_STATUSES = ["open", "agreed", "closed"] as const;

export const logActivity = defineService({
  name: "presales.activity.log",
  action: "presales:opportunity:edit",
  resource: "presales.activity",
  input: z.object({ number, title, kind: z.enum(ACTIVITY_KINDS), on: day, ownerName: person, note: z.string().trim().max(500).optional(), progress: z.number().int().min(0).max(100).default(0) }),
  async run(tx, input, ctx) {
    const o = await lockOpportunity(tx, input.number);
    const [a] = await tx.execute(sql`insert into presales.activity (tenant_id, opportunity_id, title, note, kind, owner_name, on_date, progress)
      values (${ctx.tenantId}, ${o.id}, ${input.title}, ${input.note ?? null}, ${input.kind}, ${input.ownerName ?? null}, ${input.on}, ${input.progress}) returning id`);
    return { result: { id: a.id as string }, resourceId: a.id as string, after: input };
  },
});

export const addTask = defineService({
  name: "presales.task.add",
  action: "presales:opportunity:edit",
  resource: "presales.task",
  input: z.object({ number, title, ownerName: person, due: day.optional(), status: z.enum(TASK_STATUSES).default("to-start") }),
  async run(tx, input, ctx) {
    const o = await lockOpportunity(tx, input.number);
    const [t] = await tx.execute(sql`insert into presales.task (tenant_id, opportunity_id, title, owner_name, due, status)
      values (${ctx.tenantId}, ${o.id}, ${input.title}, ${input.ownerName ?? null}, ${input.due ?? null}, ${input.status}) returning id`);
    return { result: { id: t.id as string }, resourceId: t.id as string, after: input };
  },
});

export const addRisk = defineService({
  name: "presales.risk.add",
  action: "presales:opportunity:edit",
  resource: "presales.risk",
  input: z.object({ number, kind: z.enum(RISK_KINDS), title, impact: z.enum(["low", "medium", "high"]).default("medium"), ownerName: person, status: z.enum(RISK_STATUSES).default("open") }),
  async run(tx, input, ctx) {
    const o = await lockOpportunity(tx, input.number);
    const [r] = await tx.execute(sql`insert into presales.risk (tenant_id, opportunity_id, kind, title, impact, owner_name, status, decided_on)
      values (${ctx.tenantId}, ${o.id}, ${input.kind}, ${input.title}, ${input.impact}, ${input.ownerName ?? null}, ${input.status},
              ${input.kind === "decision" && input.status === "closed" ? sql`current_date` : null}) returning id`);
    return { result: { id: r.id as string }, resourceId: r.id as string, after: input };
  },
});

// Closing a risk is what turns health back to green; the change is audited with before and after.
export const setRiskStatus = defineService({
  name: "presales.risk.status",
  action: "presales:opportunity:edit",
  resource: "presales.risk",
  input: z.object({ number, riskId: z.string().uuid(), status: z.enum(RISK_STATUSES) }),
  async run(tx, input) {
    const o = await lockOpportunity(tx, input.number);
    const [r] = await tx.execute(sql`select status from presales.risk where id = ${input.riskId} and opportunity_id = ${o.id}`);
    if (!r) throw new Error(`no such risk on ${input.number}`);
    await tx.execute(sql`update presales.risk set status = ${input.status} where id = ${input.riskId}`);
    return { result: { id: input.riskId, status: input.status }, resourceId: input.riskId, before: { status: r.status }, after: { status: input.status } };
  },
});

export const setTaskStatus = defineService({
  name: "presales.task.status",
  action: "presales:opportunity:edit",
  resource: "presales.task",
  input: z.object({ number, taskId: z.string().uuid(), status: z.enum(TASK_STATUSES) }),
  async run(tx, input) {
    const o = await lockOpportunity(tx, input.number);
    const [t] = await tx.execute(sql`select status from presales.task where id = ${input.taskId} and opportunity_id = ${o.id}`);
    if (!t) throw new Error(`no such task on ${input.number}`);
    await tx.execute(sql`update presales.task set status = ${input.status} where id = ${input.taskId}`);
    return { result: { id: input.taskId, status: input.status }, resourceId: input.taskId, before: { status: t.status }, after: { status: input.status } };
  },
});
