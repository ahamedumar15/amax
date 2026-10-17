-- Review round 5: 0006 only set closed_at when a project's status changed. Projects created closed
-- (fixtures, imports) and projects closed before 0006 had none, so their retention never started.
-- A new migration rather than an edit, so databases that already ran 0006 get it too (round 6).
create or replace function delivery.project_closed_at() returns trigger language plpgsql as $$
begin
  if new.status = 'closed' then
    if tg_op = 'INSERT' or old.status is distinct from 'closed' then new.closed_at := coalesce(new.closed_at, now()); end if;
  else
    new.closed_at := null;
  end if;
  return new;
end $$;
drop trigger project_closed_at on delivery.project;
create trigger project_closed_at before insert or update of status on delivery.project
  for each row execute function delivery.project_closed_at();
-- Projects already closed: when isn't recorded (no updated_at), so their clock starts now. That
-- keeps names a little longer than needed, never shorter.
alter table delivery.project no force row level security;
update delivery.project set closed_at = now() where status = 'closed' and closed_at is null;
alter table delivery.project force row level security;
