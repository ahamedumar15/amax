"use server";

import { z } from "zod";
import { logError } from "@amax/core/server";
import { currentViewer } from "@amax/auth";
import { getConversation, listConversations, type Conversation, type ConversationSummary } from "@amax/chat";
import { getDb } from "../../lib/server";

export type HistoryResult = { ok: true; items: ConversationSummary[] } | { ok: false; error: string };
export type OpenResult = { ok: true; conversation: Conversation } | { ok: false; error: string };

const failed = (where: string, e: unknown) => ({ ok: false as const, error: `Sorry, your chats couldn't be loaded. (ref ${logError(where, e).slice(0, 8)})` });

export async function listChats(query: unknown): Promise<HistoryResult> {
  try {
    const q = z.string().max(200).optional().parse(query ?? undefined);
    const viewer = await currentViewer();
    return { ok: true, items: await listConversations(getDb()!, viewer, { query: q }) };
  } catch (e) {
    return failed("chat.history.list", e);
  }
}

export async function openChat(id: unknown): Promise<OpenResult> {
  try {
    const conversationId = z.uuid().parse(id);
    const viewer = await currentViewer();
    const conversation = await getConversation(getDb()!, viewer, conversationId);
    return conversation ? { ok: true, conversation } : { ok: false, error: "That chat isn't in your history." };
  } catch (e) {
    return failed("chat.history.open", e);
  }
}
