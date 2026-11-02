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
      {open && hand && may("delivery:proposal:move") && <AskButton spark label="Move" name={`Move ${p.key}`} prompt={`Move ${p.key} to `} pin={pin} />}
    </>
  );
}
