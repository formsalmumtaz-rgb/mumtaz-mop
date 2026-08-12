-- 055_field_review_grants.sql
-- Admin review of held field events (T1). An admin approves a held event (clears
-- needs_review so the drain processes it) or rejects it (marks it processed so it
-- never posts). These run under mop_app via the console, so grant UPDATE on ONLY
-- the review/bookkeeping columns of outbox_events — never the event payload/type.

grant update (needs_review, review_reason, processed_at) on outbox_events to mop_app;
