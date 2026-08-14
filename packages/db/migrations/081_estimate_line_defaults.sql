-- 081_estimate_line_defaults.sql
-- Flow item 5: the estimate form computes, never asks. Two settings the distance
-- computation needs:
--   * cost.road_distance_factor — straight-line (PostGIS) → road km multiplier.
--     ASSUMED 1.3 (a common planning heuristic, not a Mumtaz-confirmed number) —
--     editable, flagged.
--   * cost.base_address — where jobs depart from. Taken from the real Sharjah
--     office line already in document_brand_office (data entered once). The
--     geocoded pin (cost.base_location) is written at runtime by the server the
--     first time it geocodes this address — a migration never calls Google.
do $$
declare v_t uuid;
begin
  select id into v_t from tenants where name = 'Mumtaz Integrated Services Group';

  insert into settings (tenant_id, service_line_id, key, value, description, is_assumed)
  values
    (v_t, null, 'cost.road_distance_factor', to_jsonb(1.3::numeric),
     'Multiplier from straight-line distance to road distance for travel-cost prefill. ASSUMED heuristic - confirm or adjust.', true),
    (v_t, null, 'cost.base_address',
     to_jsonb((select coalesce(line1 || ', ', '') || city || ', United Arab Emirates'
                 from document_brand_office
                where tenant_id = v_t and lower(city) = 'sharjah' and is_active
                limit 1)),
     'Departure point for travel-distance prefill (the Sharjah office, from document branding). Editable.', false)
  on conflict (tenant_id, service_line_id, key) do nothing;
end $$;
