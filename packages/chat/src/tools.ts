import { sql } from "drizzle-orm";
import { z } from "zod";
import type { McpToolDef, ModuleManifest } from "@amax/core";
import { defineService, getRuntime, type ServiceContext, type Source } from "@amax/core/server";
import { contextForViewer, viewerOf, type Viewer } from "@amax/auth";
import { ToolError } from "@amax/mcp";
import { getConversation, listConversations } from "./history";

const ARCHIVE = "chat:conversation:archive";
const ROLES = ["ITAdmin", "Leadership", "PM", "Engineer", "Finance", "Sales", "HR", "Payroll", "Employee"] as const;

export const archiveConversation = defineService({
  name: "chat.conversation.archive",
  action: ARCHIVE,
  resource: "chat.conversation",
  scoped: true,
  input: z.object({ id: z.uuid() }),
  run: async (tx, input, ctx) => {
    const userId = viewerOf(ctx)?.userId;
    const [row] = await tx.execute(sql`update chat.conversation set archived_at = now(), updated_at = now()
      where id = ${input.id} and user_id = ${userId ?? null} and archived_at is null returning id, title, archived_at`);
    if (!row) throw new ToolError("conversation not found", "not_found");
    return { result: { id: input.id, archived: true }, resourceId: input.id, before: { archivedAt: null }, after: { title: row.title, archivedAt: String(row.archived_at) } };
  },
});

const ctxFor = (viewer: Viewer, source: Source): ServiceContext => contextForViewer(viewer, source);

type Run<I extends z.ZodType> = (v: Viewer, input: z.infer<I>, source: "mcp" | "chat") => Promise<unknown>;
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: Run<I> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: "" };
const db = () => getRuntime().db;
const conversationId = z.object({ id: z.uuid() }).strict();

export const chatTools: McpToolDef[] = [
  tool({ ...read, pin: "view", name: "list_conversations", description: "Your own past amax chats, newest first, with title, last updated, message count and pins. Optional text search.",
    input: z.object({ query: z.string().max(200).optional(), limit: z.number().int().min(1).max(100).optional() }).strict(),
    run: (v, a) => listConversations(db(), v, a) }),
  tool({ ...read, name: "get_conversation", description: "One of your own past amax chats: its messages, pins and pending actions (expired ones are marked).",
    input: conversationId, pin: { id: "id", of: (c: { id: string; title: string } | null) => (c ? { id: c.id, label: c.title } : null) },
    run: async (v, a) => (await getConversation(db(), v, a.id)) ?? Promise.reject(new ToolError("conversation not found", "not_found")) }),
  tool({ name: "archive_conversation", description: "Archive one of your own past amax chats so it leaves your history.", scope: "write", permission: ARCHIVE,
    input: conversationId,
    service: archiveConversation, run: (v, a, s = "mcp") => archiveConversation(ctxFor(v, s), a) }),
];

export const chatPlatform: Pick<ModuleManifest, "id" | "mcpTools" | "grants" | "retention"> = {
  id: "chat",
  mcpTools: chatTools,
  grants: Object.fromEntries(ROLES.map((r) => [r, [`${ARCHIVE}@own`]])),
  // 032 AC-2: chat is kept 90 days after its last message (updated_at), then deleted. Not `idle`,
  // which counts the period from the end of the idle time and so kept it 180 days (review 058 B1).
  retention: [{ table: "chat.conversation", label: "amax chat conversations", subject: ["user_id"], fields: ["messages", "pending", "title", "pins"], class: "personal", period: "P90D", start: { at: ["updated_at"] }, action: "delete" }],
};
