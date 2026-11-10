-- 091 AC-7: a spec proposal's owner follows its repo until a person sets it in amax (update_proposal, or accepting or
-- undoing a Suggested owner); from then on a sync leaves it. Kept on the row, so a sync needn't search the audit log.
alter table delivery.proposal add column owner_set_by_person boolean not null default false;
-- Owners people set before this column: both writes are audited as delivery.proposal.update.
update delivery.proposal p set owner_set_by_person = true
where exists (select 1 from core.audit_event a where a.tenant_id = p.tenant_id and a.resource = 'delivery.proposal'
                and a.resource_id = p.id::text and a.action = 'delivery.proposal.update');
