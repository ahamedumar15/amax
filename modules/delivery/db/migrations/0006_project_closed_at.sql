-- Review round 4: retention for a project's manager starts when the project is closed, so the row
-- needs to know when that was. Kept by a trigger, so every path that closes or reopens a project
-- records it.
alter table delivery.project add column closed_at timestamptz;
create function delivery.project_closed_at() returns trigger language plpgsql as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then new.closed_at := now();
  elsif new.status <> 'closed' then new.closed_at := null;
  end if;
  return new;
end $$;
create trigger project_closed_at before update of status on delivery.project
  for each row execute function delivery.project_closed_at();
