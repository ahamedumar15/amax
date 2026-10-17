-- 050 immutable trace. One trace_id links a chat turn, MCP call or job run to its model calls, tool
-- calls, pending action, decision and audited writes. core.trace_event holds the steps the audit
-- doesn't (metadata only) and is hash-chained per tenant like the audit.
--
-- Chains are computed over keyed hashes (HMAC with the audit key) of every value that can identify
-- a person, never over the raw value. Erasure (032) nulls the raw value through core.erase_subject()
-- and both chains still verify. Audit rows written before this migration are chain v1 (raw values
-- in the hash) and are left as they are.

create table core.trace_event (
  tenant_id uuid not null references core.tenant(id),
  seq bigint not null,
  occurred_at timestamptz not null,
  trace_id uuid not null,
  kind text not null check (kind in ('turn', 'model_call', 'tool_call', 'pending', 'decided', 'mcp_call', 'job_run')),
  source text not null,
  actor text,
  actor_key text,
  on_behalf_of text,
  on_behalf_of_key text,
  tool text,
  record_id text,
  record_key text,
  args_key text,
  detail jsonb not null default '{}',
  prev_hash text not null,
  hash text not null,
  primary key (tenant_id, seq)
);
create index trace_event_trace on core.trace_event (tenant_id, trace_id);
create index trace_event_at on core.trace_event (tenant_id, occurred_at);
select core.enable_tenant_rls('core.trace_event');
grant select, insert on core.trace_event to amax_app;

alter table core.audit_event
  add column trace_id uuid,
  add column chain_v smallint not null default 1,
  add column actor_key text,
  add column on_behalf_of_key text,
  add column resource_id_key text,
  add column before_key text,
  add column after_key text,
  alter column actor drop not null;
create index audit_event_trace on core.audit_event (tenant_id, trace_id);
create index audit_event_at on core.audit_event (tenant_id, occurred_at);

alter table ai.call add column trace_id uuid;
create index call_trace on ai.call (tenant_id, trace_id);

-- The only UPDATE either chain accepts: core.erase_subject() nulling raw identifying values on a
-- keyed (v2 audit, or trace) row. Everything else, for every role, is refused.
create function core.chain_append_only() returns trigger language plpgsql as $$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  col text;
  erasable text[] := case tg_table_name
    when 'audit_event' then array['actor', 'on_behalf_of', 'resource_id', 'before', 'after']
    else array['actor', 'on_behalf_of', 'record_id'] end;
begin
  if tg_op = 'UPDATE' and current_setting('amax.erasing', true) = 'on' and current_user <> 'amax_app'
     and coalesce(o ->> 'chain_v', '2') = '2' then
    foreach col in array erasable loop
      if n -> col is distinct from o -> col and n ->> col is not null then
        raise exception '% is append-only', tg_table_name;
      end if;
      o := o - col;
      n := n - col;
    end loop;
    if o = n then return new; end if;
  end if;
  raise exception '% is append-only', tg_table_name;
end $$;

drop trigger audit_append_only on core.audit_event;
create trigger audit_append_only before update or delete on core.audit_event
  for each row execute function core.chain_append_only();

create trigger trace_append_only before update or delete on core.trace_event
  for each row execute function core.chain_append_only();
create function core.trace_no_truncate() returns trigger language plpgsql as $$
begin
  raise exception 'trace_event is append-only';
end $$;
create trigger trace_no_truncate before truncate on core.trace_event
  for each statement execute function core.trace_no_truncate();

-- ai.call: append-only for the app. The table owner (the migration role) may still change it, so a
-- later migration can add and backfill columns (048 adds user_id and conversation_id).
revoke update, delete, truncate on ai.call from amax_app;
create function ai.call_append_only() returns trigger language plpgsql as $$
begin
  if not pg_has_role(current_user, (select relowner from pg_class where oid = tg_relid), 'MEMBER') then
    raise exception 'ai.call is append-only';
  end if;
  return coalesce(new, old);
end $$;
create trigger call_append_only before update or delete on ai.call
  for each row execute function ai.call_append_only();
create trigger call_no_truncate before truncate on ai.call
  for each statement execute function ai.call_append_only();

-- Erasure (032): nulls a subject's raw identifying values in the current tenant and keeps the keyed
-- hashes, so both chains still verify. Not granted to amax_app here; 032 decides who may call it.
create function core.erase_subject(subject text) returns int language plpgsql security definer
set search_path = core, pg_temp as $$
declare
  t uuid := core.current_tenant();
  n int := 0;
  c int;
begin
  if t is null then raise exception 'erase_subject: app.tenant_id is not set'; end if;
  perform set_config('amax.erasing', 'on', true);
  update core.audit_event set actor = case when actor = subject then null else actor end,
    on_behalf_of = case when on_behalf_of = subject then null else on_behalf_of end,
    resource_id = case when resource_id = subject then null else resource_id end,
    before = case when resource_id = subject then null else before end,
    after = case when resource_id = subject then null else after end
    where tenant_id = t and chain_v = 2 and subject in (actor, on_behalf_of, resource_id);
  get diagnostics c = row_count;
  n := n + c;
  update core.trace_event set actor = case when actor = subject then null else actor end,
    on_behalf_of = case when on_behalf_of = subject then null else on_behalf_of end,
    record_id = case when record_id = subject then null else record_id end
    where tenant_id = t and subject in (actor, on_behalf_of, record_id);
  get diagnostics c = row_count;
  perform set_config('amax.erasing', 'off', true);
  return n + c;
end $$;
revoke all on function core.erase_subject(text) from public;
