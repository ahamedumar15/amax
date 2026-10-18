-- 060 AC-1: a person hold keeps the person, not a snapshot of their ids. The user id is re-resolved on
-- every read, so ids the person gains after the hold is placed are held too.
alter table privacy.legal_hold add column subject_user_id uuid;
update privacy.legal_hold h set subject_user_id = u.id from auth.user u
  where h.kind = 'person' and h.tenant_id = u.tenant_id and u.id::text = any(h.subjects);
