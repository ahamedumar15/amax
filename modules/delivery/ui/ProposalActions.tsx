import { proposalPin } from "../pins";
import type { Phase } from "../contracts";
import { AskButton } from "./AskButton";

type Actionable = { id: string; key: string; title: string; phase: Phase; source: string | null; withdrawn: boolean };
// 081: the tones Time uses for its actions: the main one primary with the spark, others plain, a destructive one a quiet link last.
type Action = { label: string; name: string; prompt: string; tone: "primary" | "plain" | "link" };

/**
 * 081 (AC-22): the lifecycle actions the viewer may run on a proposal, one list for the board card and the page. Each is
 * an Ask amax prompt with the proposal pinned; chat writes only after the person confirms the card. A spec proposal
 * changes in its repo (BR-3): only its owner can be changed here, and only on its page.
 */
export function proposalActions(p: Actionable, may: (permission: string) => boolean, where: "page" | "board"): Action[] {
  const open = !p.withdrawn && p.phase !== "released";
  const hand = p.source === null;
  const all: [boolean, string, Action][] = [
    [open && hand, "delivery:proposal:create", { label: "Edit", name: `Edit ${p.key}`, prompt: `Change ${p.key}: `, tone: "primary" }],
    [where === "page" && !p.withdrawn && !(open && hand), "delivery:proposal:create", { label: "Change owner", name: `Change the owner of ${p.key}`, prompt: `Make the owner of ${p.key} `, tone: "plain" }],
    [open && hand, "delivery:task:done", { label: "Add a task", name: `Add a task to ${p.key}`, prompt: `Add a task to ${p.key}: `, tone: "plain" }],
    [open && hand, "delivery:proposal:move", { label: "Move", name: `Move ${p.key}`, prompt: `Move ${p.key} to `, tone: "plain" }],
    [open && hand, "delivery:proposal:move", { label: "Withdraw", name: `Withdraw ${p.key}`, prompt: `Withdraw ${p.key}. Reason: `, tone: "link" }],
  ];
  return all.filter(([shown, permission]) => shown && may(permission)).map(([, , a]) => a);
}

export function ProposalActions({ p, may, where = "page" }: { p: Actionable; may: (permission: string) => boolean; where?: "page" | "board" }) {
  const pin = proposalPin(p);
  const cls = { primary: "btn sm primary", plain: "btn sm", link: "btn sm link" } as const;
  return (
    <span className="row-actions" role="group" aria-label={`Ask amax about ${p.key}`}>
      {proposalActions(p, may, where).map((a) => <AskButton key={a.label} className={cls[a.tone]} spark={a.tone === "primary"} label={a.label} name={a.name} prompt={a.prompt} pin={pin} />)}
    </span>
  );
}
