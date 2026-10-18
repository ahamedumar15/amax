import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";

export type Purpose = "snapshot" | "export";
export type TableRef = { name: string; schema: string; table: string };

/** Working state with no value after a restore: claims, leases, dedupe keys and sessions. */
const EPHEMERAL = new Set(["core.idempotency", "core.job", "core.processed_event", "core.event", "auth.session", "auth.oauth_code", "api.rate_limited", "api.replay_key"]);
/** Never leaves amax in an export: credentials, tokens and the tenant's sealed connector secrets. */
const CREDENTIAL_TABLES = new Set(["auth.api_token", "auth.principal_token", "auth.scim_token"]);
export const CREDENTIAL_COLUMNS = ["password_hash", "token_hash", "refresh_hash", "code_hash", "client_secret_ref", "claim_token"];

function kept(name: string, purpose: Purpose) {
  if (name.startsWith("backup.") || EPHEMERAL.has(name)) return false;
  return purpose === "snapshot" || !(name.startsWith("secrets.") || CREDENTIAL_TABLES.has(name));
}

/** Every table holding this tenant's rows that the app role can read (RLS scopes each to the tenant). */
export async function tenantTables(tx: Tx, purpose: Purpose): Promise<TableRef[]> {
  const rows = await tx.execute(sql`select t.table_schema as s, t.table_name as t from information_schema.tables t
    where t.table_type = 'BASE TABLE' and t.table_schema not in ('pg_catalog', 'information_schema', 'amax_migrations')
      and (exists (select 1 from information_schema.columns c where c.table_schema = t.table_schema and c.table_name = t.table_name and c.column_name = 'tenant_id')
           or (t.table_schema = 'core' and t.table_name = 'tenant'))
      and has_table_privilege(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name), 'select')
    order by 1, 2`);
  return rows.map((r) => ({ schema: r.s as string, table: r.t as string, name: `${r.s}.${r.t}` })).filter((r) => kept(r.name, purpose));
}

const ident = (t: TableRef) => sql`${sql.identifier(t.schema)}.${sql.identifier(t.table)}`;

/** The table's rows as Postgres's own JSON (exact types round-trip through jsonb_populate_recordset). */
export async function tableRows(tx: Tx, t: TableRef, purpose: Purpose): Promise<unknown[]> {
  const drop = purpose === "export" ? CREDENTIAL_COLUMNS : [];
  const [r] = await tx.execute(sql`select coalesce(jsonb_agg(to_jsonb(x) - ${`{${drop.join(",")}}`}::text[]), '[]'::jsonb) as rows from ${ident(t)} x`);
  return (r?.rows as unknown[]) ?? [];
}

export const countRows = async (tx: Tx, t: TableRef) => Number((await tx.execute(sql`select count(*)::bigint as n from ${ident(t)}`))[0]?.n ?? 0);

export { ident as tableIdent };
