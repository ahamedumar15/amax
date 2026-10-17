"use server";

import { revalidatePath } from "next/cache";
import { AiDisabledError, aiConfigured } from "@amax/ai";
import { logError } from "@amax/core/server";
import { currentViewer } from "@amax/auth";
import { ActionFailedError, cancelAction, chatTurn, confirmAction, NotPendingError, type ChatTurn, type Pin } from "@amax/chat";
import { chatIntents, getDb, toolRegistry } from "../../lib/server";

export type ChatResult = ({ ok: true } & ChatTurn) | { ok: false; error: string };

const friendly = (e: unknown) =>
  e instanceof AiDisabledError ? e.message : e instanceof Error && /forbidden|scope/.test(e.message) ? e.message : "Sorry, something went wrong. Try again.";

export async function sendChat(input: { conversationId?: string; text: string; pins?: Pin[]; intentId?: string }): Promise<ChatResult> {
  try {
    const viewer = await currentViewer();
    if (!aiConfigured()) return { ok: false, error: "AI is off: no API key is configured on the server." };
    const intent = input.intentId ? chatIntents().find((i) => i.id === input.intentId) : undefined;
    const turn = await chatTurn(getDb()!, toolRegistry(), viewer, { conversationId: input.conversationId, text: input.text.slice(0, 4000), pins: input.pins?.slice(0, 8), intent });
    return { ok: true, ...turn };
  } catch (e) {
    const id = logError("chat", e);
    return { ok: false, error: `${friendly(e)} (ref ${id.slice(0, 8)})` };
  }
}

/** The card's state after a decision; the page draws exactly this. */
export type CardOutcome = { state: "done" | "cancelled" | "open" | "working" | "error"; note: string };

// What an earlier decision means for the card now (a retry after a lost reply, review rounds 3 to 5).
// An action this conversation never had, or any other failure, is an error, never "cancelled".
function outcomeOf(e: unknown): CardOutcome {
  if (e instanceof ActionFailedError) return { state: "open", note: `That didn't work: ${e.message}. Try again or cancel.` };
  if (e instanceof NotPendingError) {
    if (e.decision === "confirmed") return { state: "done", note: "This was already done." };
    if (e.decision === "confirming") return { state: "working", note: "This is being done right now." };
    if (e.decision === "cancelled") return { state: "cancelled", note: "This was already cancelled. Nothing was changed." };
  }
  return { state: "error", note: e instanceof Error ? e.message : String(e) };
}

export async function confirmChat(conversationId: string, actionId: string): Promise<CardOutcome> {
  try {
    const viewer = await currentViewer();
    const { action, result } = await confirmAction(getDb()!, toolRegistry(), viewer, conversationId, actionId);
    revalidatePath("/", "layout");
    const key = (result as { key?: string } | null)?.key;
    return { state: "done", note: key ? `Done: ${key} added.` : `Done: ${action.title}.` };
  } catch (e) {
    return outcomeOf(e);
  }
}

export async function cancelChat(conversationId: string, actionId: string): Promise<CardOutcome> {
  try {
    const viewer = await currentViewer();
    await cancelAction(getDb()!, viewer, conversationId, actionId);
    return { state: "cancelled", note: "Cancelled. Nothing was changed." };
  } catch (e) {
    return outcomeOf(e);
  }
}
