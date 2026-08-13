-- 069_notification_fk_soft.sql
-- The notification log's entity references (job/contract/branch/customer) are
-- convenience links, not custody: the frozen content (recipient, subject, body)
-- is the record. A hard FK made the log BLOCK deletion of throwaway/draft
-- entities (surfaced by fanout.test cleanup). Soften to ON DELETE SET NULL —
-- content immutability (mig 068 trigger) is untouched; the guarded columns do
-- not include these reference ids.
alter table outbound_notifications
  drop constraint if exists outbound_notifications_job_id_fkey,
  drop constraint if exists outbound_notifications_contract_id_fkey,
  drop constraint if exists outbound_notifications_branch_id_fkey,
  drop constraint if exists outbound_notifications_customer_id_fkey;
alter table outbound_notifications
  add constraint outbound_notifications_job_id_fkey      foreign key (job_id)      references jobs(id) on delete set null,
  add constraint outbound_notifications_contract_id_fkey foreign key (contract_id) references contracts(id) on delete set null,
  add constraint outbound_notifications_branch_id_fkey   foreign key (branch_id)   references customer_branches(id) on delete set null,
  add constraint outbound_notifications_customer_id_fkey foreign key (customer_id) references customers(id) on delete set null;
