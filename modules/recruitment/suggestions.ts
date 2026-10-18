import { sql } from "drizzle-orm";
import { z } from "zod";
import type { EventHandlerDef } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { defineSuggestionKind } from "@amax/agents";
import { createSuggestion, SuggestionError } from "@amax/agents/server";
import { EVENTS, type ApplicationReceived } from "./contracts";
import { scoreCv, type CvSection, type MatchEvidence } from "./server/match";
import { actorOf, lockApplication } from "./server/read";

// 023 AC-2: the screening agent's match score is a 006 suggestion with its evidence (the CV sections
// that matched). Accepting it moves the application to screening with the score; dismissing it changes
// nothing. The kind has no way to reject: a low score is still only a suggestion to a person.
const Evidence = z.object({ skill: z.string(), section: z.string(), excerpt: z.string() });
const Screen = z.object({ applicationId: z.uuid(), roleTitle: z.string(), score: z.number().int().min(0).max(100), evidence: z.array(Evidence), missing: z.array(z.string()) });
type Screen = z.infer<typeof Screen>;

export const AGENT = "Screening agent";

export const screen = defineSuggestionKind<Screen, { at: string }>({
  kind: "recruitment.screen",
  title: "Candidate match score",
  permission: "recruitment:candidate:manage",
  proposed: Screen,
  fields: { evidence: "candidate", missing: "candidate" },
  async apply(tx, ctx, p) {
    const a = await lockApplication(tx, p.applicationId);
    if (a.stage !== "applied") throw new SuggestionError(`the application has moved on (it's at ${a.stage})`);
    await tx.execute(sql`update recruitment.application set stage = 'screening', screened_at = now(), match_score = ${p.score}, moved_by = ${actorOf(ctx)} where id = ${p.applicationId}`);
    return { applied: { at: new Date().toISOString() }, action: "recruitment.application.screen", resource: "recruitment.application", resourceId: p.applicationId, before: { stage: "applied" }, after: { stage: "screening", matchScore: p.score } };
  },
  async undo(tx, ctx, p) {
    const a = await lockApplication(tx, p.applicationId);
    if (a.stage !== "screening") throw new SuggestionError(`the application has moved on (it's at ${a.stage}), so screening can't be undone`);
    await tx.execute(sql`update recruitment.application set stage = 'applied', screened_at = null, match_score = null, moved_by = ${actorOf(ctx)} where id = ${p.applicationId}`);
    return { applied: null, action: "recruitment.application.unscreen", resource: "recruitment.application", resourceId: p.applicationId, before: { stage: "screening" }, after: { stage: "applied" } };
  },
});

const words = (e: MatchEvidence[], missing: string[]) =>
  `${e.length ? `The CV shows ${e.map((x) => `${x.skill} (${x.section})`).join(", ")}.` : "The CV names none of the role's skills."}${missing.length ? ` Not found: ${missing.join(", ")}.` : ""} Accept to move to screening; nobody is rejected by the agent.`;

/** After an application arrives: score the CV once, keep the agent's proposal on the row, and suggest it. */
export const screenAgent: EventHandlerDef = {
  id: "recruitment.screen-agent",
  event: EVENTS.applicationReceived,
  async handle({ tx, tenantId, event }) {
    const e = event.payload as ApplicationReceived;
    const [a] = await tx.execute(sql`select a.*, r.title, r.skills, c.cv from recruitment.application a join recruitment.role r on r.id = a.role_id
      join recruitment.candidate c on c.id = a.candidate_id where a.id = ${e.applicationId} and a.stage = 'applied'`);
    if (!a) return;
    const m = scoreCv((a.skills as string[]) ?? [], (a.cv as CvSection[]) ?? []);
    const score = a.agent_score === null ? m.score : Number(a.agent_score);
    await tx.execute(sql`update recruitment.application set agent_score = ${score}, agent_evidence = ${JSON.stringify(m.evidence)}::jsonb where id = ${a.id}`);
    await createSuggestion(contextFor.job(tenantId, "recruitment.screen-agent"), {
      kind: screen.kind, target: { type: "recruitment.application", id: a.id as string, label: `Application for ${a.title as string}` },
      title: `Match ${score}% for a ${a.title as string} applicant`, detail: words(m.evidence, m.missing),
      proposed: { applicationId: a.id, roleTitle: a.title, score, evidence: m.evidence, missing: m.missing }, confidence: score / 100, agentName: AGENT,
      scope: { legalEntityId: e.legalEntityId }, evidence: m.evidence.slice(0, 20).map((x) => ({ type: "record" as const, label: `CV section: ${x.section}`, ref: `/recruitment?application=${a.id as string}` })),
    });
  },
};
