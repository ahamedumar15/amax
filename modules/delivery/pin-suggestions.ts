import type { PinSuggestion } from "@amax/core";
import { can, type Viewer } from "@amax/auth";
import type { Phase } from "./contracts";
import { getProject, getProposal, type ProposalRow } from "./server/queries";

// 081 AC-30, AC-31: a pinned proposal makes chat offer the next step that fits it now, as Time's pinned weeks do (073):
// two clicks (+, then the suggestion), nothing to type but what the step needs, and still the confirm card. Read when
// chat asks, so a proposal that moved since the page was drawn offers what fits now; a pin that no longer resolves
// offers nothing. The prompts are the strings chat's tools take ("Move CON-017 to planned").
type Offer = { label: string; prompt: string; tool: string };
const NEXT: Partial<Record<Phase, Phase>> = { proposed: "planned", planned: "building" };
const label = (p: Phase) => p[0].toUpperCase() + p.slice(1);
const MAX = 2;

/** What fits this proposal, before permissions: the next move, a first task, an owner. */
export function offersFor(p: ProposalRow, me: string): (Offer & { permission: string })[] {
  if (p.withdrawn || p.phase === "released") return [];
  const owner = p.ownerUserId ? [] : [{ label: `Make me the owner of ${p.key}`, prompt: `Make me (user id ${me}) the owner of ${p.key}`, tool: "update_proposal", permission: "delivery:proposal:create" }];
  if (p.source !== null) return owner;
  const allDone = p.phase === "building" && p.tasksTotal > 0 && p.tasksDone === p.tasksTotal;
  const to = allDone ? "verified" : NEXT[p.phase];
  const move = to ? [{ label: `Move ${p.key} to ${label(to)}`, prompt: `Move ${p.key} to ${to}`, tool: "move_proposal", permission: "delivery:proposal:move" }] : [];
  const task = p.tasksTotal === 0 ? [{ label: `Add a task to ${p.key}`, prompt: `Add a task to ${p.key}: `, tool: "add_proposal_task", permission: "delivery:task:done" }] : [];
  return [...move, ...task, ...owner];
}

async function suggest(v: Viewer, args: Record<string, unknown>): Promise<Offer[]> {
  const proposalId = typeof args.proposalId === "string" ? args.proposalId : undefined;
  const key = typeof args.key === "string" ? args.key : undefined;
  if (!proposalId && !key) return [];
  const p = await getProposal(v, { proposalId, key });
  if (!p) return [];
  const projectId = (await getProject(v, p.projectKey))?.project.id;
  if (!projectId) return [];
  return offersFor(p, v.userId).filter((o) => can(v, o.permission, { projectId })).slice(0, MAX).map(({ label: l, prompt, tool }) => ({ label: l, prompt, tool }));
}

export const pinSuggestions: PinSuggestion[] = [{ tool: "get_proposal", suggest: suggest as PinSuggestion["suggest"] }];
