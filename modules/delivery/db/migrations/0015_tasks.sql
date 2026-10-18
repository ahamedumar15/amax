-- 008 AC-1: a proposal's tasks as records (T1, T2, …), so a commit or CI can close one by name.
-- sync_proposal writes them from the spec; mark_task_done closes one. Done never goes back to open
-- through a sync: a task closed by a commit stays closed. done_by is the actor id ("sp:…", "user:…").
create table delivery.task (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  proposal_id uuid not null references delivery.proposal(id),
  ref text not null check (ref ~ '^T[0-9]+$'),
  title text not null,
  done boolean not null default false,
  done_at timestamptz,
  done_by text,
  unique (proposal_id, ref)
);
select core.enable_tenant_rls('delivery.task');
grant select, insert, update on delivery.task to amax_app;
