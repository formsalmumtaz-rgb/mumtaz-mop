-- 048_job_scheduling_fields.sql
-- Scheduling detail on jobs so the operations calendar can show start time and
-- duration, detect conflicts, and surface open slots. Additive + nullable — no
-- behaviour change until the scheduler UI sets them; existing date-only jobs keep
-- working. Scheduling stays manually editable (office overrides everything).
alter table jobs add column scheduled_start     time,
                 add column est_duration_minutes integer check (est_duration_minutes is null or est_duration_minutes >= 0);
