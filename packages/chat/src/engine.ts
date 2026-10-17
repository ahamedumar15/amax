import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import { converse, type DataItem, type Message, type Tool } from "@amax/ai";
import { CancelledByKeyError, claimKey, retryable, withIdempotency } from "@amax/core/server";
import type { Registry, RegisteredTool } from "@amax/mcp";
import type { Viewer } from "@amax/auth";

export type Intent = { id: string; label: string; tool: string; required: string[]; fields: { name: string; ask: string; options?: string[] }[] };
export type Pin = { label: string; tool: string; args: Record<string, unknown> };
export type PendingAction = { id: string; tool: string; title: string; input: Record<string, unknown>; fields: string[] };
export type Highlight = { text: string; field: string; index: number };
export type ChatTurn = { conversationId: string; reply: string; toolsRun: string[]; pending: PendingAction[]; highlights: Highlight[] };

const INSTRUCTIONS = `You are amax, the assistant inside an ERP for software and professional-services companies.
Answer briefly and concretely. Use the read tools to look things up instead of guessing.
To create or change anything, call the matching write tool with every field you can fill. Write tools don't run straight away:
the user sees a confirm card and decides, so never say a change is done until a later message confirms it.
If a required field is missing, ask for it in one short question instead of calling the tool.
If a tool says you're not allowed, tell the user plainly that their role can't do that.`;

const titleOf = (t: RegisteredTool, input: Record<string, unknown>) =>
  `${t.description.split(".")[0]}: ${Object.values(input).filter((v) => typeof v === "string" || typeof v === "number").join(", ")}`;

async function load(db: Db, viewer: Viewer, id?: string) {
  return withTenant(db, viewer.tenantId, async (tx) => {
    const [row] = id
      ? await tx.execute(sql`select * from chat.conversation where id = ${id} and user_id = ${viewer.userId}`)
      : await tx.execute(sql`insert into chat.conversation (tenant_id, user_id) values (${viewer.tenantId}, ${viewer.userId}) returning *`);
    if (!row) throw new Error("conversation not found");
    return { id: row.id as string, messages: row.messages as Message[], pending: row.pending as PendingAction[] };
  });
}

// Append-only: a turn runs for seconds, and a confirm or cancel may claim a card or add a note
// meanwhile. Rewriting the lists from the turn's stale copy would undo that (review round 2).
const append = (db: Db, viewer: Viewer, id: string, add: { messages: Message[]; pending: PendingAction[] }) =>
  withTenant(db, viewer.tenantId, (tx) => tx.execute(sql`update chat.conversation set messages = messages || ${JSON.stringify(add.messages)}::jsonb,
    pending = pending || ${JSON.stringify(add.pending)}::jsonb, updated_at = now() where id = ${id} and user_id = ${viewer.userId}`));

// Each extracted value that appears in the user's words gets its field's colour (AC-3).
export function highlightsFor(text: string, pending: PendingAction[]): Highlight[] {
  const out: Highlight[] = [];
  for (const p of pending) {
    for (const [field, value] of Object.entries(p.input)) {
      const v = String(value);
      if (v.length < 2) continue;
      const at = text.toLowerCase().indexOf(v.toLowerCase());
      if (at >= 0) out.push({ text: text.slice(at, at + v.length), field, index: at });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/** One user message: answer with read tools, turn write calls into confirm cards. */
export async function chatTurn(db: Db, registry: Registry, viewer: Viewer, opts: { conversationId?: string; text: string; pins?: Pin[]; intent?: Intent }): Promise<ChatTurn> {
  const convo = await load(db, viewer, opts.conversationId);
  const pending: PendingAction[] = [];
  const tools: Tool[] = registry.toolsFor(viewer).map((t) => ({
    name: t.name,
    description: t.description,
    input: t.input,
    sensitive: t.sensitive,
    run: async (input: Record<string, unknown>) => {
      if (t.scope !== "write") return registry.call(viewer, t.name, input, { source: "chat" });
      const action = { id: randomUUID(), tool: t.name, title: titleOf(t, input), input, fields: Object.keys(input) };
      pending.push(action);
      return { status: "awaiting_confirmation", note: "The user now sees a confirm card for this. Don't say it's done." };
    },
  }) as Tool);

  // Pinned records are fetched with the user's own permissions and sent as quoted data (AC-4).
  const data: DataItem[] = [];
  for (const pin of opts.pins ?? []) {
    const tool = registry.toolsFor(viewer, ["read"]).find((t) => t.name === pin.tool);
    if (!tool) continue;
    const record = await registry.call(viewer, pin.tool, pin.args, { scopes: ["read"], source: "chat" }).catch((e: Error) => ({ error: e.message }));
    // A record, not text, so the gateway redacts its classified fields like any other record.
    data.push({ label: pin.label, record, sensitive: tool.sensitive });
  }

  const intentNote = opts.intent
    ? `\n\nThe user started "${opts.intent.label}". Fill the ${opts.intent.tool} tool; required: ${opts.intent.required.join(", ")}. Questions to use when something is missing: ${opts.intent.fields.map((f) => `${f.name}: ${f.ask}`).join(" | ")}.`
    : "";
  const messages: Message[] = [...convo.messages, { role: "user", content: [{ type: "text", text: opts.text }] }];
  const result = await converse({ tenantId: viewer.tenantId, caller: `user:${viewer.userId}`, source: "chat", purpose: opts.intent ? `chat:${opts.intent.id}` : "chat" }, {
    instructions: INSTRUCTIONS + intentNote,
    messages,
    tools,
    data,
  });
  await append(db, viewer, convo.id, { messages: result.messages.slice(convo.messages.length), pending });
  return { conversationId: convo.id, reply: result.text, toolsRun: result.toolsRun.filter((n) => !pending.some((p) => p.tool === n)), pending, highlights: highlightsFor(opts.text, pending) };
}

/** What happened to a card: confirmed (the write ran), cancelled, or failed for good. */
export type Decision = "confirmed" | "cancelled" | "failed";

/**
 * The card isn't pending: `decision` says what happened to it earlier (perhaps by a request whose
 * reply was lost), or is null when this conversation never had that action.
 */
export class NotPendingError extends Error {
  constructor(public decision: Decision | null) {
    super(decision ? `that action was already ${decision}` : "that action isn't in this conversation");
    this.name = "NotPendingError";
  }
}

/** The write failed. `retry`: the card is still there and a retry is safe; otherwise it's closed as failed. */
export class ActionFailedError extends Error {
  constructor(message: string, public retry: boolean) {
    super(message);
    this.name = "ActionFailedError";
  }
}

// Each card's write runs under its own idempotency key (review round 7). The key is recorded in the
// service's transaction, with its result, so whatever goes wrong afterwards (a lost reply, a crash
// before the card is updated, an error after commit) a retry returns the stored result instead of
// writing twice, and two clicks at once get one write. Cancelling claims the same key, so a cancel
// and a confirm can't both win.
const keyOf = (actionId: string) => `chat:${actionId}`;

async function card(db: Db, viewer: Viewer, conversationId: string, actionId: string) {
  const [row] = await withTenant(db, viewer.tenantId, (tx) => tx.execute(sql`select pending, decided from chat.conversation where id = ${conversationId} and user_id = ${viewer.userId}`));
  if (!row) throw new Error("conversation not found");
  const action = (row.pending as PendingAction[]).find((p) => p.id === actionId);
  if (!action) throw new NotPendingError((row.decided as Record<string, Decision>)[actionId] ?? null);
  return action;
}

// Records the decision once: takes the card out of pending (if it's still there) and adds a note.
async function settle(tx: Tx, viewer: Viewer, conversationId: string, action: PendingAction, decision: Decision, text: string) {
  const [row] = await tx.execute(sql`select pending from chat.conversation where id = ${conversationId} and user_id = ${viewer.userId} for update`);
  const pending = (row?.pending ?? []) as PendingAction[];
  if (!pending.some((p) => p.id === action.id)) return;
  await tx.execute(sql`update chat.conversation set pending = ${JSON.stringify(pending.filter((p) => p.id !== action.id))}::jsonb,
    decided = decided || ${JSON.stringify({ [action.id]: decision })}::jsonb,
    messages = messages || ${JSON.stringify([{ role: "user", content: [{ type: "text", text }] }])}::jsonb, updated_at = now() where id = ${conversationId}`);
}

const settleNow = (db: Db, viewer: Viewer, conversationId: string, action: PendingAction, decision: Decision, text: string) =>
  withTenant(db, viewer.tenantId, (tx) => settle(tx, viewer, conversationId, action, decision, text));

/** "Add it": run the pending write as the user, source chat (AC-3), at most once per card. */
export async function confirmAction(db: Db, registry: Registry, viewer: Viewer, conversationId: string, actionId: string) {
  const action = await card(db, viewer, conversationId, actionId);
  let result: unknown;
  try {
    result = await withIdempotency(keyOf(actionId), () => registry.call(viewer, action.tool, action.input, { source: "chat" }));
  } catch (e) {
    if (e instanceof CancelledByKeyError) {
      await settleNow(db, viewer, conversationId, action, "cancelled", `(I cancelled "${action.title}".)`);
      throw new NotPendingError("cancelled");
    }
    const message = e instanceof Error ? e.message : String(e);
    // Refused, invalid and the like can't succeed later: close the card. Anything else stays pending,
    // and retrying it is safe because of the key.
    if (retryable(e)) throw new ActionFailedError(message, true);
    await settleNow(db, viewer, conversationId, action, "failed", `(I tried "${action.title}" but it couldn't be done: ${message})`);
    throw new ActionFailedError(message, false);
  }
  await settleNow(db, viewer, conversationId, action, "confirmed", `(I confirmed "${action.title}". Result: ${JSON.stringify(result)})`);
  return { action, result };
}

/** "Cancel": nothing is written. Cancelling twice is fine; a card that was already done or failed throws NotPendingError. */
export async function cancelAction(db: Db, viewer: Viewer, conversationId: string, actionId: string) {
  const action = await card(db, viewer, conversationId, actionId).catch((e) => {
    if (e instanceof NotPendingError && e.decision === "cancelled") return null;
    throw e;
  });
  if (!action) return;
  const prior = await withTenant(db, viewer.tenantId, async (tx) => {
    const prior = await claimKey(tx, viewer.tenantId, keyOf(actionId), { cancelled: true });
    if (!prior || "cancelled" in prior) await settle(tx, viewer, conversationId, action, "cancelled", `(I cancelled "${action.title}".)`);
    return prior;
  });
  if (prior && !("cancelled" in prior)) {
    // The write had already run (its reply may have been lost): record it as done.
    await settleNow(db, viewer, conversationId, action, "confirmed", `(I confirmed "${action.title}". Result: ${JSON.stringify(prior.result)})`);
    throw new NotPendingError("confirmed");
  }
}
