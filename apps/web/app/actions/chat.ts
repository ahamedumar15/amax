"use server";

import { revalidatePath } from "next/cache";
import { AiDisabledError, aiConfigured } from "@amax/ai";
import { logError } from "@amax/core/server";
import { currentViewer } from "@amax/auth";
import { cancelAction, chatTurn, confirmAction, type ChatTurn, type Pin } from "@amax/chat";
import { outcomeOf, type CardOutcome } from "../../lib/chat-outcome";
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

export type { CardOutcome };

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
