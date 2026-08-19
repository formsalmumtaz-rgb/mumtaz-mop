-- 103_area_window_ratified.sql
-- Owner ruling, 19 Aug 2026 — the two §3.3 scheduling values are now RATIFIED,
-- so they stop being ASSUMED. Confirmation clears the flag and is audited
-- (Art. X §4). Both stay editable from settings without a deploy.
--
--  * week starts Monday — confirmed as seeded.
--  * "near" 5 km -> 15 km. The owner's reason, recorded because it is the kind of
--    operational fact the platform cannot derive: UAE work is inter-emirate, and
--    a team in Al Nahda (Sharjah) is genuinely passing a site in Al Qusais
--    (Dubai) at ~12 km. 5 km was too tight and would have suppressed real
--    off-pattern first visits.
update settings
   set value = '15'::jsonb,
       is_assumed = false,
       confirmed_at = now(),
       description = 'A team passing within 15 km of the site counts as "near" for an off-pattern first visit. '
                     || 'Owner-ratified 19 Aug 2026: UAE work is inter-emirate — Al Nahda (Sharjah) to Al Qusais (Dubai) is ~12 km and is genuinely "passing". Editable.',
       updated_at = now()
 where key = 'scheduling.near_area_km' and service_line_id is null;

update settings
   set is_assumed = false,
       confirmed_at = now(),
       description = 'The working week starts Monday — decides what "this week" means when slotting a first visit. Owner-ratified 19 Aug 2026. Editable.',
       updated_at = now()
 where key = 'scheduling.week_start_day' and service_line_id is null;
