-- 101_contract_engagement_type.sql
-- "Estimates are NOT forced to AMC. Recurring is a CHOICE at estimate/contract
-- creation; one-off stays one-off." (queue §3.2)
--
-- Until now every estimate that became a contract became a RECURRING one: the
-- conversion always derived a frequency from the municipality matrix and always
-- set a 364-day term, so a single call-out silently became an annual maintenance
-- contract. The choice already existed on the estimate (estimates.engagement_type)
-- and was thrown away at the boundary.
--
-- The contract now carries the choice itself, because the scheduler needs it:
-- a NULL frequency currently means "cannot schedule yet" and is correctly
-- ignored, so a one-off cannot be expressed by absence — it needs saying.
--   recurring -> frequency drives the visit dates, as before (unchanged)
--   ad_hoc    -> exactly ONE visit, on the start date
--   null      -> unchanged behaviour: nothing is scheduled until a frequency exists
alter table contracts
  add column if not exists engagement_type text;

alter table contracts drop constraint if exists contracts_engagement_type_check;
alter table contracts add constraint contracts_engagement_type_check
  check (engagement_type is null or engagement_type in ('recurring', 'ad_hoc'));

comment on column contracts.engagement_type is
  'recurring = repeating AMC driven by frequency_id; ad_hoc = a single visit on start_date. NULL keeps the pre-existing behaviour (nothing scheduled without a frequency).';

-- Existing contracts are left NULL on purpose. Every one of them was created
-- under the old always-recurring path and already carries a frequency, so their
-- behaviour is unchanged; back-filling a value would assert an intent nobody
-- recorded (Art. X §4).
