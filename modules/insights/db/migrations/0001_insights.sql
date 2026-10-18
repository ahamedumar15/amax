-- 026 insights: what the agents concluded, each with the sources it rests on (AC-1), and the tenant's
-- settings: the demo's pinned "today" and the person the weekly briefing is written for.
create schema insights;
grant usage on schema insights to amax_app;

-- One insight. `scope`: the legal entity it is about (null: the whole tenant); `needs`: a permission a
-- viewer must also hold to see it. `key` names what it is about, so a newer run's insight on the same
-- thing supersedes the older one. `data` holds the screen's figures for its kind (a risk's percent,
-- a trend's verdict).
create table insights.insight (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  kind text not null check (kind in ('briefing', 'risk', 'opportunity', 'trend', 'market', 'talent')),
  key text,
  title text not null check (length(title) between 1 and 200),
  body text not null check (length(body) <= 2000),
  suggestion text check (length(suggestion) <= 500),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  as_of date not null,
  horizon text not null default '90d' check (horizon in ('90d', '12m')),
  scope uuid references core.legal_entity(id),
  needs text,
  data jsonb not null default '{}'::jsonb,
  rank int not null default 0,
  recorded_by text not null,
  recorded_at timestamptz not null default now(),
  superseded_at timestamptz,
  dismissed_by text,
  dismissed_at timestamptz
);
create index insight_live_idx on insights.insight (tenant_id, kind, as_of desc) where superseded_at is null and dismissed_at is null;

-- What an insight rests on: a label ("allocations and the presales board") and a link to the evidence,
-- an amax path ("/presales") or an https URL.
create table insights.source (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  insight_id uuid not null references insights.insight(id) on delete cascade,
  label text not null check (length(label) between 1 and 300),
  evidence_ref text not null check (evidence_ref ~ '^(/[A-Za-z0-9/_?=&.-]*|https://\S+)$'),
  position int not null default 0
);
create index source_insight_idx on insights.source (insight_id, position);

-- AC-1: an insight with no source is refused when its transaction commits, and a source can't be
-- removed from under its insight.
create function insights.require_source() returns trigger language plpgsql as $$
declare target uuid;
begin
  if tg_table_name = 'insight' then target := new.id; else target := old.insight_id; end if;
  if exists (select 1 from insights.insight i where i.id = target) and not exists (select 1 from insights.source s where s.insight_id = target) then
    raise exception 'insight % has no source', target using errcode = 'check_violation';
  end if;
  return null;
end $$;
create constraint trigger insight_has_source after insert on insights.insight deferrable initially deferred for each row execute function insights.require_source();
create constraint trigger source_kept after delete on insights.source deferrable initially deferred for each row execute function insights.require_source();

create table insights.settings (
  tenant_id uuid primary key references core.tenant(id),
  today date,
  briefing_for uuid
);

select core.enable_tenant_rls('insights.insight');
select core.enable_tenant_rls('insights.source');
select core.enable_tenant_rls('insights.settings');
grant select, insert, update, delete on all tables in schema insights to amax_app;
