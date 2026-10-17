"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AiDisabledError, aiConfigured } from "@amax/ai";
import { logError } from "@amax/core/server";
import { currentViewer } from "@amax/auth";
import { cancelAction, chatTurn, confirmAction, repinConversations, repinOf, type ChatTurn, type Pin } from "@amax/chat";
import { myChatUsage } from "../../lib/chat-usage";
import { movedOf, outcomeOf, type CardOutcome } from "../../lib/chat-outcome";
import { chatIntents, getDb, toolRegistry } from "../../lib/server";

export type ChatResult = ({ ok: true; usage: string | null } & ChatTurn) | { ok: false; error: string };

const friendly = (e: unknown) =>
  e instanceof AiDisabledError ? e.message : e instanceof Error && /forbidden|scope/.test(e.message) ? e.message : "Sorry, something went wrong. Try again.";

export async function sendChat(input: { conversationId?: string; text: string; pins?: Pin[]; intentId?: string }): Promise<ChatResult> {
  try {
    const viewer = await currentViewer();
    if (!aiConfigured()) return { ok: false, error: "AI is off: no API key is configured on the server." };
    const intent = input.intentId ? chatIntents().find((i) => i.id === input.intentId) : undefined;
    const turn = await chatTurn(getDb()!, toolRegistry(), viewer, { conversationId: input.conversationId, text: input.text.slice(0, 4000), pins: input.pins?.slice(0, 8), intent });
    return { ok: true, ...turn, usage: await myChatUsage(viewer) };
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
    // A rename (re-tag, environment rename): saved pins that name the record the old way follow it (057).
    const repin = repinOf(result);
    const pins = repin ? await repinConversations(getDb()!, viewer, conversationId, repin) : undefined;
    revalidatePath("/", "layout");
    const key = (result as { key?: string } | null)?.key;
    return { state: "done", note: key ? `Done: ${key} added.` : `Done: ${action.title}.`, moved: movedOf(result), ...(pins ? { pins } : {}) };
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

const secretForm = z.object({ secret: z.string().min(1).max(16_384) });

/**
 * Confirm a card whose tool takes a typed secret (047 AC-4). The value arrives only here, from the
 * card's masked field, and is handed to the tool for this one call: it is never stored, logged,
 * echoed back or sent to the model.
 */
export async function confirmSecretChat(conversationId: string, actionId: string, data: FormData): Promise<CardOutcome> {
  try {
    const parsed = secretForm.safeParse({ secret: data.get("secret") });
    if (!parsed.success) return { state: "open", note: "Type the value first." };
    const viewer = await currentViewer();
    await confirmAction(getDb()!, toolRegistry(), viewer, conversationId, actionId, { secret: parsed.data.secret });
    revalidatePath("/", "layout");
    return { state: "done", note: "Done: saved to the vault. The value can't be shown again." };
  } catch (e) {
    return outcomeOf(e);
  }
}
