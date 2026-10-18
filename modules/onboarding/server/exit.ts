import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@amax/db";
import { assertCan, viewerOf } from "@amax/auth";
import { tokenHash } from "@amax/auth/tokens";
import { contextFor, defineService, getRuntime } from "@amax/core/server";
import { EVENTS, EXIT_LINK_DAYS, EXIT_QUESTIONS, type ExitAnswered, type ExitAnswers, type ExitLinkIssued } from "../contracts";
import { actorOf } from "./read";

// 013 AC-3: the exit questionnaire link. The token is 192 random bits, shown once to HR to send on,
// and kept only as its keyed digest (as bearer tokens are). It works for EXIT_LINK_DAYS and once.
const newExitToken = () => `amx_exit_${randomBytes(24).toString("base64url")}`;
const IDS = EXIT_QUESTIONS.map((q) => q.id) as [string, ...string[]];

export const issueExitLink = defineService({
  scoped: true,
  name: "onboarding.exit.issue",
  action: "onboarding:exit:send",
  resource: "onboarding.exit_link",
  input: z.object({ checklistId: z.string().uuid() }),
  async run(tx, input, ctx) {
    const [c] = await tx.execute(sql`select c.*, x.answered_at from onboarding.checklist c left join onboarding.exit_link x on x.checklist_id = c.id where c.id = ${input.checklistId} for update of c`);
    if (!c) throw new Error("no such checklist");
    const v = viewerOf(ctx);
    if (v) assertCan(v, "onboarding:exit:send", { legalEntityId: c.legal_entity_id as string });
    if (c.kind !== "leaver") throw new Error("an exit questionnaire is for a leaver's checklist");
    if (c.answered_at) throw new Error(`${c.person_name} has already answered the exit questionnaire`);
    // A new link replaces an unanswered one, so only the latest link works.
    const token = newExitToken();
    const [x] = await tx.execute(sql`insert into onboarding.exit_link (tenant_id, checklist_id, person_id, token_hash, expires_at, issued_by)
      values (${ctx.tenantId}, ${c.id}, ${c.person_id}, ${tokenHash(token)}, now() + make_interval(days => ${EXIT_LINK_DAYS}), ${actorOf(ctx)})
      on conflict (checklist_id) do update set token_hash = excluded.token_hash, expires_at = excluded.expires_at, issued_by = excluded.issued_by, issued_at = now()
      returning id, expires_at`);
    const expiresAt = new Date(x.expires_at as string).toISOString();
    const payload: ExitLinkIssued = { checklistId: c.id as string, personId: c.person_id as string, expiresAt, by: actorOf(ctx) };
    // The link goes back to HR once, as a reveal: chat shows it on the confirm card only, never in the
    // transcript the model reads, the audit or the outbox (the 035 API-key pattern).
    return { result: { checklistId: c.id as string, personName: c.person_name as string, expiresAt, reveal: { label: "Exit questionnaire link", value: `/exit/${token}` } }, resourceId: x.id as string,
      after: { checklistId: c.id, expiresAt }, events: [{ name: EVENTS.exitLinkIssued, payload }] };
  },
});

/** The tenant a link belongs to, found by its digest alone: the leaver is signed out. */
async function tenantOf(token: string) {
  const [r] = await getRuntime().db.execute(sql`select onboarding.lookup_exit_link(${tokenHash(token)}) as tenant_id`);
  return (r?.tenant_id as string | null) ?? null;
}

export type ExitView =
  | { state: "unknown" }
  | { state: "open" | "answered" | "expired"; personName: string; expiresAt: string; questions: typeof EXIT_QUESTIONS };

/** What the leaver's page shows for a token: the questions while the link is open, else why it isn't. */
export async function exitQuestionnaire(token: string): Promise<ExitView> {
  const tenantId = await tenantOf(token);
  if (!tenantId) return { state: "unknown" };
  return withTenant(getRuntime().db, tenantId, async (tx) => {
    const [x] = await tx.execute(sql`select x.*, c.person_name, x.expires_at < now() as expired from onboarding.exit_link x join onboarding.checklist c on c.id = x.checklist_id where x.token_hash = ${tokenHash(token)}`);
    if (!x) return { state: "unknown" };
    const state = x.answered_at ? "answered" : x.expired ? "expired" : "open";
    return { state, personName: x.person_name as string, expiresAt: new Date(x.expires_at as string).toISOString(), questions: EXIT_QUESTIONS };
  });
}

const answersInput = z.object({
  token: z.string().min(20).max(200),
  answers: z.partialRecord(z.enum(IDS), z.string().trim().max(2000)).refine((a) => Object.values(a).some((v) => v), { message: "answer at least one question" }),
});

// Runs as the onboarding job for the leaver: the link is their credential, so there is no viewer.
const recordAnswers = defineService({
  name: "onboarding.exit.answer",
  action: "onboarding:exit:answer",
  resource: "onboarding.exit_link",
  input: answersInput,
  async run(tx, input, ctx) {
    const answers: ExitAnswers = Object.fromEntries(Object.entries(input.answers).filter(([, v]) => v));
    // Single use: only an unanswered, unexpired link takes answers, and only once.
    const [x] = await tx.execute(sql`update onboarding.exit_link set answered_at = now(), answers = ${JSON.stringify(answers)}::jsonb
      where token_hash = ${tokenHash(input.token)} and answered_at is null and expires_at >= now() returning id, checklist_id, person_id, answered_at`);
    if (!x) {
      const [why] = await tx.execute(sql`select answered_at from onboarding.exit_link where token_hash = ${tokenHash(input.token)}`);
      throw new Error(!why ? "this link doesn't work" : why.answered_at ? "this link has already been used" : `this link expired; links work for ${EXIT_LINK_DAYS} days`);
    }
    const payload: ExitAnswered = { checklistId: x.checklist_id as string, personId: x.person_id as string, answeredAt: new Date(x.answered_at as string).toISOString() };
    return { result: { answered: true }, resourceId: x.id as string, after: { questions: Object.keys(answers) }, events: [{ name: EVENTS.exitAnswered, payload }] };
  },
});

/** The leaver submits their answers with the link's token. Throws when the link is unknown, used or expired. */
export async function answerExit(token: string, answers: Record<string, string>) {
  const tenantId = await tenantOf(token);
  if (!tenantId) throw new Error("this link doesn't work");
  return recordAnswers(contextFor.job(tenantId, "onboarding.exit-link"), { token, answers });
}

/** For the hosting route's form action: the page's fields are named after the question ids. */
export const exitFormAnswers = (form: FormData) => Object.fromEntries(IDS.map((id) => [id, String(form.get(id) ?? "")]));
