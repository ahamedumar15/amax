import { bigint, char, integer, jsonb, pgSchema, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Mirrors packages/db/migrations; the SQL files are the source of truth for DDL and RLS.
export const core = pgSchema("core");

const tenantId = () => uuid("tenant_id").notNull().references(() => tenant.id);
const at = (name: string) => timestamp(name, { withTimezone: true });

export const tenant = core.table("tenant", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: at("created_at").notNull().defaultNow(),
});

export const legalEntity = core.table("legal_entity", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  country: char("country", { length: 2 }).notNull(),
  baseCurrency: char("base_currency", { length: 3 }).notNull(),
  createdAt: at("created_at").notNull().defaultNow(),
});

export const auditEvent = core.table("audit_event", {
  tenantId: tenantId(),
  seq: bigint("seq", { mode: "number" }).notNull(),
  occurredAt: at("occurred_at").notNull().defaultNow(),
  traceId: uuid("trace_id"),
  chainV: smallint("chain_v").notNull().default(1),
  actor: text("actor"),
  actorKey: text("actor_key"),
  onBehalfOf: text("on_behalf_of"),
  onBehalfOfKey: text("on_behalf_of_key"),
  source: text("source").notNull(),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id"),
  resourceIdKey: text("resource_id_key"),
  before: jsonb("before"),
  beforeKey: text("before_key"),
  after: jsonb("after"),
  afterKey: text("after_key"),
  prevHash: text("prev_hash").notNull(),
  hash: text("hash").notNull(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.seq] })]);

export const traceEvent = core.table("trace_event", {
  tenantId: tenantId(),
  seq: bigint("seq", { mode: "number" }).notNull(),
  occurredAt: at("occurred_at").notNull(),
  traceId: uuid("trace_id").notNull(),
  kind: text("kind").notNull(),
  source: text("source").notNull(),
  actor: text("actor"),
  actorKey: text("actor_key"),
  onBehalfOf: text("on_behalf_of"),
  onBehalfOfKey: text("on_behalf_of_key"),
  tool: text("tool"),
  recordId: text("record_id"),
  recordKey: text("record_key"),
  argsKey: text("args_key"),
  detail: jsonb("detail").notNull().default({}),
  prevHash: text("prev_hash").notNull(),
  hash: text("hash").notNull(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.seq] })]);

export const event = core.table("event", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: at("created_at").notNull().defaultNow(),
  deliveredAt: at("delivered_at"),
  attempts: integer("attempts").notNull().default(0),
  lockedUntil: at("locked_until"),
  lastError: text("last_error"),
});

export const job = core.table("job", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  key: text("key"),
  payload: jsonb("payload").notNull().default({}),
  cron: text("cron"),
  runAt: at("run_at").notNull().defaultNow(),
  status: text("status", { enum: ["pending", "done", "failed"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lockedUntil: at("locked_until"),
  lastError: text("last_error"),
});

export const processedEvent = core.table("processed_event", {
  handler: text("handler").notNull(),
  eventId: uuid("event_id").notNull(),
  tenantId: tenantId(),
  processedAt: at("processed_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.handler, t.eventId] })]);
