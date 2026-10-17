import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import { converse, toolFailure, type DataItem, type Message, type Tool } from "@amax/ai";
import { CancelledByKeyError, claimKey, currentTrace, KEY_DAYS, logError, lookupKey, retryable, traceStep, withIdempotency, withTrace } from "@amax/core/server";
import type { Registry, RegisteredTool } from "@amax/mcp";
import type { Viewer } from "@amax/auth";

export type Intent = { id: string; label: string; tool: string; required: string[]; fields: { name: string; ask: string; options?: string[] }[] };
export type Pin = { label: string; tool: string; args: Record<string, unknown> };
/** `createdAt` (ISO): a card expires after CARD_DAYS, before its idempotency record can be pruned. */
/** `traceId` (050): the turn that proposed it, so its confirm or cancel joins the same trace. */
export type PendingAction = { id: string; tool: string; title: string; input: Record<string, unknown>; fields: string[]; createdAt: string; secret?: { label: string }; traceId?: string };
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
export const titleFrom = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 80);
const append = (db: Db, viewer: Viewer, id: string, add: { messages: Message[]; pending: PendingAction[]; title: string; pins: Pin[] }) =>
  withTenant(db, viewer.tenantId, (tx) => tx.execute(sql`update chat.conversation set messages = messages || ${JSON.stringify(add.messages)}::jsonb,
    pending = pending || ${JSON.stringify(add.pending)}::jsonb, title = coalesce(title, ${add.title}), pins = ${JSON.stringify(add.pins)}::jsonb,
    updated_at = now() where id = ${id} and user_id = ${viewer.userId}`));

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

// 050: a turn, and later its cards' decisions, run under one trace acting as the user.
const traceFor = (viewer: Viewer, traceId?: string) => ({ traceId, tenantId: viewer.tenantId, actor: `user:${viewer.userId}`, source: "chat" as const });

// The gateway hands write tools the input it validated, so a field the tool doesn't declare (a
// "value" the model made up, say) never reaches the card. A tool that takes a typed secret marks the
// card, which then asks the person for it in a masked field (047 AC-4).
function pendingFor(t: RegisteredTool, input: Record<string, unknown>): PendingAction {
  return { id: randomUUID(), tool: t.name, title: titleOf(t, input), input, fields: Object.keys(input), createdAt: new Date().toISOString(), traceId: currentTrace()?.traceId, ...(t.secretInput ? { secret: t.secretInput } : {}) };
}

// An error from a write that was given a secret never carries it on, even if some layer echoed it.
function scrub(e: unknown, secret: string | undefined): unknown {
  if (!secret || !(e instanceof Error) || !`${e.message}${e.stack ?? ""}`.includes(secret)) return e;
  const clean = new Error(e.message.split(secret).join("••••"));
  return Object.assign(clean, { name: e.name, retryable: (e as { retryable?: unknown }).retryable, code: (e as { code?: unknown }).code });
}

/** One user message: answer with read tools, turn write calls into confirm cards. */
export const chatTurn = (db: Db, registry: Registry, viewer: Viewer, opts: { conversationId?: string; text: string; pins?: Pin[]; intent?: Intent }): Promise<ChatTurn> =>
  withTrace(traceFor(viewer), () => runTurn(db, registry, viewer, opts));

async function runTurn(db: Db, registry: Registry, viewer: Viewer, opts: { conversationId?: string; text: string; pins?: Pin[]; intent?: Intent }): Promise<ChatTurn> {
  const convo = await load(db, viewer, opts.conversationId);
  await traceStep({ kind: "turn", recordId: convo.id, detail: { pins: opts.pins?.length ?? 0, intent: opts.intent?.id ?? null } });
  const pending: PendingAction[] = [];
  const tools: Tool[] = registry.toolsFor(viewer).map((t) => ({
    name: t.name,
    description: t.description,
    input: t.input,
    sensitive: t.sensitive,
    run: async (input: Record<string, unknown>) => {
      if (t.scope !== "write") return registry.call(viewer, t.name, input, { source: "chat" });
      const action = pendingFor(t, input);
      pending.push(action);
      await traceStep({ kind: "pending", tool: t.name, args: input, detail: { actionId: action.id } });
      return { status: "awaiting_confirmation", note: "The user now sees a confirm card for this. Don't say it's done." };
    },
  }) as Tool);

  // Pinned records are fetched with the user's own permissions and sent as quoted data (AC-4).
  const data: DataItem[] = [];
  for (const pin of opts.pins ?? []) {
    // A pin that can't be read is still sent, as a fixed marker: the model must not answer as if it
    // had the record, and an error message never reaches it (it can echo values; final review).
    const tool = registry.toolsFor(viewer, ["read"]).find((t) => t.name === pin.tool);
    if (!tool) { data.push({ label: pin.label, record: { unavailable: "not available to this user" } }); continue; }
    const record = await registry.call(viewer, pin.tool, pin.args, { scopes: ["read"], source: "chat" })
      .catch((e: unknown) => ({ unavailable: toolFailure(pin.tool, e, logError(`chat.pin ${pin.tool}`, e)) }));
    // A record, not text, so the gateway redacts its classified fields like any other record.
    data.push({ label: pin.label, record, sensitive: tool.sensitive });
  }

  const intentNote = opts.intent
    ? `\n\nThe user started "${opts.intent.label}". Fill the ${opts.intent.tool} tool; required: ${opts.intent.required.join(", ")}. Questions to use when something is missing: ${opts.intent.fields.map((f) => `${f.name}: ${f.ask}`).join(" | ")}.`
    : "";
  const messages: Message[] = [...convo.messages, { role: "user", content: [{ type: "text", text: opts.text }] }];
  const result = await converse({ tenantId: viewer.tenantId, caller: `user:${viewer.userId}`, userId: viewer.userId, conversationId: convo.id, source: "chat", purpose: opts.intent ? `chat:${opts.intent.id}` : "chat" }, {
    instructions: INSTRUCTIONS + intentNote,
    messages,
    tools,
    data,
  });
  await append(db, viewer, convo.id, { messages: result.messages.slice(convo.messages.length), pending, title: titleFrom(opts.text), pins: opts.pins ?? [] });
  return { conversationId: convo.id, reply: result.text, toolsRun: result.toolsRun.filter((n) => !pending.some((p) => p.tool === n)), pending, highlights: highlightsFor(opts.text, pending) };
}

/** What happened to a card: confirmed (the write ran), cancelled, failed for good, or unknown. */
export type Decision = "confirmed" | "cancelled" | "failed" | "unknown" | "expired";

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

/**
 * The write didn't complete. `retry`: nothing was written and the card is still there. `failed`: it
 * can't succeed, the card is closed. `unknown`: whether it was done can't be told, the card is closed
 * and the user is asked to check before trying again (never a blind retry).
 */
export class ActionFailedError extends Error {
  constructor(message: string, public kind: "retry" | "failed" | "unknown") {
    super(message);
    this.name = "ActionFailedError";
  }
}

// Each card's write runs under its own idempotency key (core/idempotency.ts has the contract). The
// stored outcome is checked first; the tool must make exactly one service write; an error is
// resolved by reading the key back, so a write that committed is reported as done, never retried;
// cancel claims the same key, so cancel and confirm can't both win (review rounds 7 and 8).
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

const UNKNOWN = "I can't tell whether this was done. Check the record before trying again.";

// A card can be confirmed for CARD_DAYS. Its idempotency record lives KEY_DAYS from the attempt, so
// while a card can still be confirmed, the record of any earlier attempt still exists: a pruned
// record can never be mistaken for "never written" (review round 9).
// Fail closed: a card without a readable createdAt counts as expired (migration 0015 backfilled the
// cards stored before it). Once expired, a missing record can mean "never confirmed" or "confirmed,
// record pruned", so an expired card never claims nothing happened (review rounds 9 and 10).
export const CARD_DAYS = KEY_DAYS - 1;
export const isExpired = (a: PendingAction, now = Date.now()) => {
  const at = Date.parse(a.createdAt ?? "");
  return Number.isNaN(at) || now - at > CARD_DAYS * 86_400_000;
};
const expire = async (db: Db, viewer: Viewer, conversationId: string, action: PendingAction) => {
  await settleNow(db, viewer, conversationId, action, "expired", `(The request "${action.title}" expired. If it was confirmed earlier, check the record before asking again.)`);
  return new NotPendingError("expired");
};

// What the conversation records about a write: the record's key, never the result itself, which
// may hold classified fields and is read back by the model (review round 9).
const doneNote = (title: string, result: unknown) => {
  const key = (result as { key?: unknown } | null)?.key;
  return `(I confirmed "${title}".${typeof key === "string" ? ` Record: ${key}.` : ""})`;
};

// A confirm is recorded as the person decides, before the write runs; a cancel once it has taken effect.
const decidedStep = (action: PendingAction, decision: "confirmed" | "cancelled") => traceStep({ kind: "decided", tool: action.tool, detail: { actionId: action.id, decision } });
const inTrace = <T>(viewer: Viewer, action: PendingAction, fn: () => Promise<T>) => withTrace(traceFor(viewer, action.traceId), fn);

/** "Add it": run the pending write as the user, source chat (AC-3), at most once per card. */
export async function confirmAction(db: Db, registry: Registry, viewer: Viewer, conversationId: string, actionId: string, opts: { secret?: string } = {}) {
  const action = await card(db, viewer, conversationId, actionId);
  return inTrace(viewer, action, async () => {
    await decidedStep(action, "confirmed");
    return confirmCard(db, registry, viewer, conversationId, action, opts);
  });
}

async function confirmCard(db: Db, registry: Registry, viewer: Viewer, conversationId: string, action: PendingAction, opts: { secret?: string }) {
  const actionId = action.id;
  const key = keyOf(actionId);
  const done = async (result: unknown) => {
    await settleNow(db, viewer, conversationId, action, "confirmed", doneNote(action.title, result));
    return { action, result };
  };
  const cancelled = async () => {
    await settleNow(db, viewer, conversationId, action, "cancelled", `(I cancelled "${action.title}".)`);
    return new NotPendingError("cancelled");
  };
  // 1. An earlier attempt's outcome comes first (its reply may have been lost).
  const known = await lookupKey(db, viewer.tenantId, key);
  if (known && "cancelled" in known) throw await cancelled();
  if (known) return done(known.done);
  if (isExpired(action)) throw await expire(db, viewer, conversationId, action);
  // 2. Run the tool; it must make exactly one service write.
  if (action.secret && !opts.secret) throw new ActionFailedError(`type the ${action.secret.label.toLowerCase()} first`, "retry");
  const raw = await withIdempotency(key, () => registry.call(viewer, action.tool, action.input, { source: "chat", secret: action.secret ? opts.secret : undefined }));
  const run = raw.ok ? raw : { ...raw, error: scrub(raw.error, opts.secret) };
  if (!run.ok && run.error instanceof CancelledByKeyError) throw await cancelled();
  if (run.writes > 1) {
    await settleNow(db, viewer, conversationId, action, "unknown", `(I tried "${action.title}" but it made more than one change; check before trying again.)`);
    throw new ActionFailedError(UNKNOWN, "unknown");
  }
  if (run.ok) {
    if (run.writes === 1) return done(run.value);
    // No service write: it went around the pipeline (or did nothing), so it can't be made safe.
    await settleNow(db, viewer, conversationId, action, "unknown", `(I tried "${action.title}" but couldn't confirm what it changed.)`);
    throw new ActionFailedError(UNKNOWN, "unknown");
  }
  // 3. It threw. Read the key back: a write that committed before the error is done, not retried.
  const after = await lookupKey(db, viewer.tenantId, key);
  if (after && "done" in after) return done(after.done);
  const message = run.error instanceof Error ? run.error.message : String(run.error);
  if (retryable(run.error)) throw new ActionFailedError(message, "retry");
  // The note is read back by the model: the failure kind and a reference, never the message (final review).
  await settleNow(db, viewer, conversationId, action, "failed", `(I tried "${action.title}" but ${toolFailure(action.tool, run.error, logError(`chat.confirm ${action.tool}`, run.error))})`);
  throw new ActionFailedError(message, "failed");
}

/** "Cancel": nothing is written. Cancelling twice is fine; a card that was already decided otherwise throws NotPendingError. */
export async function cancelAction(db: Db, viewer: Viewer, conversationId: string, actionId: string) {
  const action = await card(db, viewer, conversationId, actionId).catch((e) => {
    if (e instanceof NotPendingError && e.decision === "cancelled") return null;
    throw e;
  });
  if (!action) return;
  await inTrace(viewer, action, async () => {
    await cancelCard(db, viewer, conversationId, action);
    await decidedStep(action, "cancelled");
  });
}

async function cancelCard(db: Db, viewer: Viewer, conversationId: string, action: PendingAction) {
  const actionId = action.id;
  // The same expiry rule as confirm: past it, the key may have been pruned, so claiming it as
  // cancelled could hide a write that happened (review round 10).
  if (isExpired(action)) {
    const known = await lookupKey(db, viewer.tenantId, keyOf(actionId));
    if (known && "done" in known) {
      await settleNow(db, viewer, conversationId, action, "confirmed", doneNote(action.title, known.done));
      throw new NotPendingError("confirmed");
    }
    throw await expire(db, viewer, conversationId, action);
  }
  const prior = await withTenant(db, viewer.tenantId, async (tx) => {
    const prior = await claimKey(tx, viewer.tenantId, keyOf(actionId), { cancelled: true });
    if (!prior || "cancelled" in prior) await settle(tx, viewer, conversationId, action, "cancelled", `(I cancelled "${action.title}".)`);
    return prior;
  });
  if (prior && "done" in prior) {
    // The write had already run (its reply may have been lost): record it as done.
    await settleNow(db, viewer, conversationId, action, "confirmed", doneNote(action.title, prior.done));
    throw new NotPendingError("confirmed");
  }
}
