import { ActionFailedError, NotPendingError } from "@amax/chat";

/** The card's state after a decision; the page draws exactly this. */
export type CardOutcome = { state: "done" | "cancelled" | "open" | "error"; note: string };

/**
 * What a failed confirm or cancel means for the card (review rounds 3 to 8). "cancelled" only when it
 * really was cancelled; anything unknown is an error, never a silent close.
 */
export function outcomeOf(e: unknown): CardOutcome {
  if (e instanceof ActionFailedError) {
    if (e.kind === "retry") return { state: "open", note: `That didn't work: ${e.message}. Try again or cancel.` };
    if (e.kind === "failed") return { state: "error", note: `This couldn't be done: ${e.message}. Nothing was changed.` };
    return { state: "error", note: e.message };
  }
  if (e instanceof NotPendingError) {
    if (e.decision === "confirmed") return { state: "done", note: "This was already done." };
    if (e.decision === "cancelled") return { state: "cancelled", note: "This was already cancelled. Nothing was changed." };
    if (e.decision === "failed") return { state: "error", note: "This couldn't be done. Nothing was changed." };
    if (e.decision === "unknown") return { state: "error", note: "It wasn't clear whether this was done. Check the record before trying again." };
  }
  return { state: "error", note: e instanceof Error ? e.message : String(e) };
}
