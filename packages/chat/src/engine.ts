import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
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

const save = (db: Db, viewer: Viewer, c: { id: string; messages: Message[]; pending: PendingAction[] }) =>
  withTenant(db, viewer.tenantId, (tx) => tx.execute(sql`update chat.conversation set messages = ${JSON.stringify(c.messages)}::jsonb,
    pending = ${JSON.stringify(c.pending)}::jsonb, updated_at = now() where id = ${c.id} and user_id = ${viewer.userId}`));

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
  const next = { id: convo.id, messages: result.messages, pending: [...convo.pending, ...pending] };
  await save(db, viewer, next);
  return { conversationId: convo.id, reply: result.text, toolsRun: result.toolsRun.filter((n) => !pending.some((p) => p.tool === n)), pending, highlights: highlightsFor(opts.text, pending) };
}

// Takes the action out of the pending list under a row lock, so two confirms of the same card can't
// both run it (review round 1, B7). Returns null when it was already taken.
async function claim(db: Db, viewer: Viewer, conversationId: string, actionId: string) {
  return withTenant(db, viewer.tenantId, async (tx) => {
    const [row] = await tx.execute(sql`select pending from chat.conversation where id = ${conversationId} and user_id = ${viewer.userId} for update`);
    if (!row) throw new Error("conversation not found");
    const pending = row.pending as PendingAction[];
    const action = pending.find((p) => p.id === actionId);
    if (!action) return null;
    await tx.execute(sql`update chat.conversation set pending = ${JSON.stringify(pending.filter((p) => p.id !== actionId))}::jsonb, updated_at = now() where id = ${conversationId}`);
    return action;
  });
}

async function note(db: Db, viewer: Viewer, conversationId: string, text: string) {
  await withTenant(db, viewer.tenantId, (tx) => tx.execute(sql`update chat.conversation
    set messages = messages || ${JSON.stringify([{ role: "user", content: [{ type: "text", text }] }])}::jsonb, updated_at = now()
    where id = ${conversationId} and user_id = ${viewer.userId}`));
}

/** "Add it": claim the pending write, then run it as the user, source chat (AC-3). */
export async function confirmAction(db: Db, registry: Registry, viewer: Viewer, conversationId: string, actionId: string) {
  const action = await claim(db, viewer, conversationId, actionId);
  if (!action) throw new Error("that action is no longer pending");
  let result: unknown;
  try {
    result = await registry.call(viewer, action.tool, action.input, { source: "chat" });
  } catch (e) {
    // The write didn't happen: put the card back so the user can retry or cancel.
    await withTenant(db, viewer.tenantId, (tx) => tx.execute(sql`update chat.conversation set pending = pending || ${JSON.stringify([action])}::jsonb where id = ${conversationId}`));
    throw e;
  }
  await note(db, viewer, conversationId, `(I confirmed "${action.title}". Result: ${JSON.stringify(result)})`);
  return { action, result };
}

/** "Cancel": nothing is written. */
export async function cancelAction(db: Db, viewer: Viewer, conversationId: string, actionId: string) {
  const action = await claim(db, viewer, conversationId, actionId);
  if (action) await note(db, viewer, conversationId, `(I cancelled "${action.title}".)`);
}
