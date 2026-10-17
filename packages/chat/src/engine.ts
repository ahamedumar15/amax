import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import { converse, type DataItem, type Message, type Tool } from "@amax/ai";
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

/** The write failed. `retry`: nothing changed and the card is still there; otherwise it's closed as failed. */
export class ActionFailedError extends Error {
  constructor(message: string, public retry: boolean) {
    super(message);
    this.name = "ActionFailedError";
  }
}

// Failures a retry can't fix: refused, out of scope, bad input, no such record (review round 6).
const PERMANENT = new Set(["ForbiddenError", "ScopeError", "ZodError", "ValidationError", "KeyTakenError"]);
const permanent = (e: unknown) =>
  e instanceof Error && (PERMANENT.has(e.name) || ["forbidden", "invalid_input", "not_found"].includes(String((e as { code?: unknown }).code)));

type Locked = { tx: Tx; action: PendingAction; pending: PendingAction[] };

/** Another decision on this conversation is running right now; ask again shortly. Nothing is stored. */
export class BusyError extends Error {
  constructor() {
    super("another decision in this conversation is running");
    this.name = "BusyError";
  }
}

const lockNotAvailable = (e: unknown): boolean =>
  typeof e === "object" && e !== null && ((e as { code?: unknown }).code === "55P03" || lockNotAvailable((e as { cause?: unknown }).cause));

// Runs `fn` with the conversation row locked and the action still pending. The lock is held for the
// whole decision, so nothing is ever half-decided: no in-between state to get stuck in, and if the
// process dies the transaction rolls back and the card is simply still pending. A second click
// meanwhile doesn't wait (that would hold a pooled connection); it gets BusyError at once (review
// rounds 1, 5 and 6).
async function decide<T>(db: Db, viewer: Viewer, conversationId: string, actionId: string, fn: (l: Locked) => Promise<T>) {
  return withTenant(db, viewer.tenantId, async (tx) => {
    const [row] = await tx.execute(sql`select pending, decided from chat.conversation where id = ${conversationId} and user_id = ${viewer.userId} for update nowait`)
      .catch((e: unknown) => { throw lockNotAvailable(e) ? new BusyError() : e; });
    if (!row) throw new Error("conversation not found");
    const pending = row.pending as PendingAction[];
    const action = pending.find((p) => p.id === actionId);
    if (!action) throw new NotPendingError((row.decided as Record<string, Decision>)[actionId] ?? null);
    return fn({ tx, action, pending });
  });
}

async function close({ tx, action, pending }: Locked, conversationId: string, decision: Decision, text: string) {
  await tx.execute(sql`update chat.conversation set pending = ${JSON.stringify(pending.filter((p) => p.id !== action.id))}::jsonb,
    decided = decided || ${JSON.stringify({ [action.id]: decision })}::jsonb,
    messages = messages || ${JSON.stringify([{ role: "user", content: [{ type: "text", text }] }])}::jsonb, updated_at = now() where id = ${conversationId}`);
}

/** "Add it": run the pending write as the user, source chat (AC-3), and record it in the same transaction. */
export async function confirmAction(db: Db, registry: Registry, viewer: Viewer, conversationId: string, actionId: string) {
  const out = await decide(db, viewer, conversationId, actionId, async (l) => {
    let result: unknown;
    try {
      result = await registry.call(viewer, l.action.tool, l.action.input, { source: "chat" });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!permanent(e)) return { failed: new ActionFailedError(message, true) }; // nothing recorded: still pending
      await close(l, conversationId, "failed", `(I tried "${l.action.title}" but it couldn't be done: ${message})`);
      return { failed: new ActionFailedError(message, false) };
    }
    await close(l, conversationId, "confirmed", `(I confirmed "${l.action.title}". Result: ${JSON.stringify(result)})`);
    return { action: l.action, result };
  });
  if ("failed" in out) throw out.failed;
  return out;
}

/** "Cancel": nothing is written. Cancelling twice is fine; cancelling a decided or unknown card throws NotPendingError. */
export async function cancelAction(db: Db, viewer: Viewer, conversationId: string, actionId: string) {
  await decide(db, viewer, conversationId, actionId, (l) => close(l, conversationId, "cancelled", `(I cancelled "${l.action.title}".)`)).catch((e) => {
    if (e instanceof NotPendingError && e.decision === "cancelled") return;
    throw e;
  });
}
