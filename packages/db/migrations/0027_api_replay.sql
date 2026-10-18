-- 060 AC-8: GitHub and Graph calls carry no signed timestamp, so a verified body hash is their only
-- replay protection. The keys live here, outside api.inbound (the personal-data log the retention purge
-- deletes after P90D), and nothing deletes them. They hold no personal data: a provider and a hash.
create table api.replay_key (
  tenant_id uuid not null references core.tenant(id),
  provider text not null,
  key text not null,
  first_seen timestamptz not null default now(),
  primary key (tenant_id, provider, key)
);
select core.enable_tenant_rls('api.replay_key');
grant select, insert on api.replay_key to amax_app;
insert into api.replay_key (tenant_id, provider, key, first_seen)
  select tenant_id, provider, event_id, min(received_at) from api.inbound where verified and event_id is not null group by 1, 2, 3
  on conflict do nothing;
