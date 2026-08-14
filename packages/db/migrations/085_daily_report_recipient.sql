-- 085_daily_report_recipient.sql
-- Vision P4: where the day-close operations report is emailed. The owner's
-- known admin address — confirmed data, editable in settings.
do $$
declare v_t uuid;
begin
  select id into v_t from tenants where name = 'Mumtaz Integrated Services Group';
  insert into settings (tenant_id, key, value, description, is_assumed)
  select v_t, 'reports.daily_recipient', to_jsonb('sahad@almumtaz.ae'::text),
         'Recipient of the automatic day-close daily operations report email.', false
   where not exists (select 1 from settings s where s.tenant_id = v_t and s.key = 'reports.daily_recipient');
end $$;
