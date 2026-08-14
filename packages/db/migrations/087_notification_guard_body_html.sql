-- 087_notification_guard_body_html.sql
-- Regression fix: mig 084 re-created the content-immutability guard from the
-- 068 wording and accidentally re-froze customer_id, clobbering 070's rule that
-- reference links (job/contract/branch/customer, ON DELETE SET NULL) are NOT
-- content. Restore 070 semantics + keep body_html frozen (surfaced by the
-- fanout test cleanup — the suite caught it, as designed).
-- CONTENT = kind, recipient, subject, bodies, attachment, resend_of, created_at.
create or replace function enforce_notification_bookkeeping()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'outbound_notifications is append-only (DELETE forbidden)';
  end if;
  if new.kind is distinct from old.kind
     or new.to_email is distinct from old.to_email or new.subject is distinct from old.subject
     or new.body_text is distinct from old.body_text or new.body_html is distinct from old.body_html
     or new.attachment_ref is distinct from old.attachment_ref
     or new.resend_of is distinct from old.resend_of or new.created_at is distinct from old.created_at then
    raise exception 'outbound_notifications content is immutable - only delivery bookkeeping and reference links may change';
  end if;
  return new;
end $$;
