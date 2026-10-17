import { boolean, pgSchema, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Mirrors packages/db/migrations/0004_auth.sql (the source of truth for DDL and RLS).
export const auth = pgSchema("auth");
const at = (name: string) => timestamp(name, { withTimezone: true });
const tenantId = () => uuid("tenant_id").notNull();

export const identityProvider = auth.table("identity_provider", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantId(),
  kind: text("kind").notNull().default("entra"),
  issuer: text("issuer").notNull(),
  directoryId: text("directory_id").notNull(),
  clientId: text("client_id").notNull(),
  clientSecretRef: text("client_secret_ref").notNull(),
  scimTokenHash: text("scim_token_hash"),
  createdAt: at("created_at").notNull().defaultNow(),
});

export const roleMapping = auth.table("role_mapping", {
  tenantId: tenantId(),
  groupId: text("group_id").notNull(),
  role: text("role").notNull(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.groupId, t.role] })]);

export const user = auth.table("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantId(),
  externalId: text("external_id"),
  scimId: text("scim_id"),
  email: text("email").notNull(),
  name: text("name").notNull(),
  legalEntityId: uuid("legal_entity_id"),
  department: text("department"),
  status: text("status", { enum: ["active", "deactivated"] }).notNull().default("active"),
  createdAt: at("created_at").notNull().defaultNow(),
  updatedAt: at("updated_at").notNull().defaultNow(),
});

export const roleAssignment = auth.table("role_assignment", {
  tenantId: tenantId(),
  userId: uuid("user_id").notNull(),
  role: text("role").notNull(),
  source: text("source", { enum: ["group", "manual"] }).notNull().default("group"),
  legalEntityIds: uuid("legal_entity_ids").array(),
  departments: text("departments").array(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.userId, t.role] })]);

export const gitIdentity = auth.table("git_identity", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantId(),
  userId: uuid("user_id").notNull(),
  provider: text("provider", { enum: ["github", "azure-devops"] }).notNull(),
  login: text("login").notNull(),
  email: text("email"),
  emailVerified: boolean("email_verified").notNull().default(false),
});

export const session = auth.table("session", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantId(),
  userId: uuid("user_id").notNull(),
  viewAsRole: text("view_as_role"),
  createdAt: at("created_at").notNull().defaultNow(),
  expiresAt: at("expires_at").notNull(),
  revokedAt: at("revoked_at"),
});

export const apiToken = auth.table("api_token", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantId(),
  userId: uuid("user_id").notNull(),
  kind: text("kind", { enum: ["api", "mcp"] }).notNull(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  createdAt: at("created_at").notNull().defaultNow(),
  expiresAt: at("expires_at").notNull(),
  revokedAt: at("revoked_at"),
});

export const servicePrincipal = auth.table("service_principal", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  ownerUserId: uuid("owner_user_id").notNull(),
  scopes: text("scopes").array().notNull(),
  actsFor: uuid("acts_for").array().notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: at("expires_at").notNull(),
  createdAt: at("created_at").notNull().defaultNow(),
  revokedAt: at("revoked_at"),
});

