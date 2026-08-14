-- 084_email_html_daily_report.sql
-- Vision P2/P4: branded HTML email body + the daily operations report kind.
--   * body_html joins the FROZEN content columns (immutability trigger extended);
--   * kind gains 'daily_report' (P4's day-close email to the admin).
-- Additive; append-only invariant strengthened, not weakened.

alter table outbound_notifications add column if not exists body_html text;

do $$
begin
  -- extend the kind check to include daily_report (drop + re-add pattern)
  begin
    alter table outbound_notifications drop constraint outbound_notifications_kind_check;
  exception when undefined_object then null;
  end;
  alter table outbound_notifications add constraint outbound_notifications_kind_check
    check (kind in ('visit_notice_24h','eta_notice','annual_schedule','schedule_change',
                    'service_report','receipt','invoice','document_expiry','manual',
                    'attestation','daily_report'));
end $$;

create or replace function enforce_notification_bookkeeping()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'outbound_notifications is append-only (DELETE forbidden)';
  end if;
  if new.kind is distinct from old.kind or new.customer_id is distinct from old.customer_id
     or new.to_email is distinct from old.to_email or new.subject is distinct from old.subject
     or new.body_text is distinct from old.body_text or new.body_html is distinct from old.body_html
     or new.attachment_ref is distinct from old.attachment_ref
     or new.resend_of is distinct from old.resend_of or new.created_at is distinct from old.created_at then
    raise exception 'outbound_notifications content is immutable — only delivery bookkeeping (status/provider_id/error/sent_at) may change';
  end if;
  return new;
end $$;
