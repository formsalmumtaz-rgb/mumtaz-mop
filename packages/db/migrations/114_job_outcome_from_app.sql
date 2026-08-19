-- 114_job_outcome_from_app.sql
-- §3.6 — "Job status from the app: completed / CANCELLED / DELAYED with reason —
-- flows to ops and the schedule."
--
-- 'cancelled' already existed; 'delayed' did not, and it is genuinely a third
-- outcome. Cancelled means the visit is not happening. Failed means it was
-- attempted and could not be done. DELAYED means it did not happen today and
-- still has to — the office needs it back on the schedule, which is the opposite
-- of closing it off. Collapsing it into either of the others loses the work.
alter table jobs drop constraint if exists jobs_status_check;
alter table jobs add constraint jobs_status_check
  check (status = any (array['scheduled','assigned','en_route','arrived','in_progress',
                             'completed','failed','cancelled','delayed']));

-- A reason is not optional for either outcome; the technician is the only person
-- who knows why, and by the time the office asks, the day has moved on.
alter table jobs
  add column if not exists status_reason text,
  add column if not exists status_changed_at timestamptz;

comment on column jobs.status_reason is
  'Why the job was cancelled or delayed, in the technician''s words. Captured at the moment it happens (3.6).';

-- Cancelled and delayed must carry a reason; nothing else needs one.
alter table jobs drop constraint if exists jobs_outcome_needs_reason;
alter table jobs add constraint jobs_outcome_needs_reason
  check (status not in ('cancelled','delayed') or nullif(btrim(coalesce(status_reason,'')),'') is not null);
