import { proposalPin } from "../pins";
import type { ProposalDetail } from "../server/proposal-detail";
import { AskButton } from "./AskButton";

/** 081: the lifecycle actions the viewer may run on this proposal, each an Ask amax prompt; chat confirms the write. */
export function ProposalActions({ p, may }: { p: ProposalDetail; may: (permission: string) => boolean }) {
  const pin = proposalPin(p);
  const open = !p.withdrawn && p.phase !== "released";
  const hand = p.source === null;
  return (
    <>
      {open && hand && may("delivery:proposal:create") && <AskButton spark label="Edit" name={`Edit ${p.key}`} prompt={`Change ${p.key}: `} pin={pin} />}
      {!p.withdrawn && !(open && hand) && may("delivery:proposal:create") && <AskButton spark label="Change owner" name={`Change the owner of ${p.key}`} prompt={`Make the owner of ${p.key} `} pin={pin} />}
      {open && hand && may("delivery:task:done") && <AskButton spark label="Add a task" name={`Add a task to ${p.key}`} prompt={`Add a task to ${p.key}: `} pin={pin} />}
      {open && hand && may("delivery:proposal:move") && <AskButton spark label="Move" name={`Move ${p.key}`} prompt={`Move ${p.key} to `} pin={pin} />}
      {open && hand && may("delivery:proposal:move") && <AskButton spark label="Withdraw" name={`Withdraw ${p.key}`} prompt={`Withdraw ${p.key}. Reason: `} pin={pin} />}
    </>
  );
}
