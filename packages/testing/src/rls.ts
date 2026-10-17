import type postgres from "postgres";

// Tables the app role can reach without tenant isolation: any table with a tenant_id column
// (plus core.tenant) that lacks enabled + forced RLS or a policy. Modules assert this is empty.
export async function tablesMissingRls(owner: postgres.Sql): Promise<string[]> {
  const rows = await owner`
    select n.nspname || '.' || c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r'
      and n.nspname not in ('pg_catalog', 'information_schema', 'amax_migrations')
      and (exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped)
           or (n.nspname = 'core' and c.relname = 'tenant'))
      and not (c.relrowsecurity and c.relforcerowsecurity and exists (select 1 from pg_policy p where p.polrelid = c.oid))
    order by 1`;
  return rows.map((r) => r.name as string);
}
