-- 090_contract_closeout_kind.sql
-- Item 4: the contract closeout email is its own notification kind (the
-- renewal sales tool sent at the last service of an unrenewed contract).
do $$
begin
  begin
    alter table outbound_notifications drop constraint outbound_notifications_kind_check;
  exception when undefined_object then null;
  end;
  alter table outbound_notifications add constraint outbound_notifications_kind_check
    check (kind in ('visit_notice_24h','eta_notice','annual_schedule','schedule_change',
                    'service_report','receipt','invoice','document_expiry','manual',
                    'attestation','daily_report','contract_closeout'));
end $$;
