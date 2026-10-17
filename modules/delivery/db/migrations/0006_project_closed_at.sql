-- Review rounds 4 and 5: retention for a project's manager starts when the project is closed, so the
-- row needs to know when that was. A trigger keeps it on insert and on every status change, so
-- projects created closed (fixtures, imports) get one too.
alter table delivery.project add column closed_at timestamptz;
create function delivery.project_closed_at() returns trigger language plpgsql as $$
begin
  if new.status = 'closed' then
    if tg_op = 'INSERT' or old.status is distinct from 'closed' then new.closed_at := coalesce(new.closed_at, now()); end if;
  else
    new.closed_at := null;
  end if;
  return new;
end $$;
create trigger project_closed_at before insert or update of status on delivery.project
  for each row execute function delivery.project_closed_at();
-- Projects already closed: when isn't recorded (no updated_at), so their clock starts now. That
-- keeps names a little longer than needed, never shorter.
alter table delivery.project no force row level security;
update delivery.project set closed_at = now() where status = 'closed' and closed_at is null;
alter table delivery.project force row level security;
