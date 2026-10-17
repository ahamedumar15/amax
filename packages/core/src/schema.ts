import { bigint, char, integer, jsonb, pgSchema, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
  actor: text("actor").notNull(),
  onBehalfOf: text("on_behalf_of"),
  source: text("source").notNull(),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id"),
  before: jsonb("before"),
  after: jsonb("after"),
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
