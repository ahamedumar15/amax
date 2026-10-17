"use server";

import { revalidatePath } from "next/cache";
import { AiDisabledError, aiConfigured } from "@amax/ai";
import { logError } from "@amax/core/server";
import { currentViewer } from "@amax/auth";
import { cancelAction, chatTurn, confirmAction, NotPendingError, type ChatTurn, type Pin } from "@amax/chat";
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

export async function confirmChat(conversationId: string, actionId: string): Promise<{ ok: true; summary: string } | { ok: false; error: string; earlier?: "confirmed" | "cancelled" }> {
  try {
    const viewer = await currentViewer();
    const { action, result } = await confirmAction(getDb()!, toolRegistry(), viewer, conversationId, actionId);
    revalidatePath("/", "layout");
    const key = (result as { key?: string } | null)?.key;
    return { ok: true, summary: key ? `Done: ${key} added.` : `Done: ${action.title}.` };
  } catch (e) {
    // A retry after a lost reply: say what happened the first time (review rounds 3 and 4). An action
    // this conversation never had stays an error.
    if (e instanceof NotPendingError && e.decision) return { ok: false, earlier: e.decision, error: e.decision === "confirmed" ? "This was already done." : "This was already cancelled. Nothing was changed." };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function cancelChat(conversationId: string, actionId: string) {
  const viewer = await currentViewer();
  await cancelAction(getDb()!, viewer, conversationId, actionId);
}
