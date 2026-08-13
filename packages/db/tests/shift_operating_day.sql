-- shift_operating_day.sql — proves the night-shift operating-day rule (mig 071):
-- a 02:00 night-shift job belongs to the PREVIOUS operating day; day jobs and
-- night jobs starting before midnight keep their scheduled date. Rolled back.
begin;
do $$
declare
  t uuid; sl uuid; cust uuid; sh_day uuid; sh_night uuid; j uuid; od date;
begin
  insert into tenants(name) values ('Shift Test') returning id into t;
  insert into service_lines(tenant_id, code, name) values (t, 'sh_pest', 'SH') returning id into sl;
  insert into customers(tenant_id, trade_name) values (t, 'Shift Cust') returning id into cust;
  insert into shifts(tenant_id, service_line_id, code, name, start_time, end_time)
    values (t, sl, 'day', 'Day', '08:00', '18:00') returning id into sh_day;
  insert into shifts(tenant_id, service_line_id, code, name, start_time, end_time)
    values (t, sl, 'night', 'Night', '22:00', '06:00') returning id into sh_night;

  -- (1) night shift, 02:00 → previous operating day
  insert into jobs(tenant_id, service_line_id, customer_id, status, scheduled_date, scheduled_start, shift_id)
    values (t, sl, cust, 'scheduled', date '2026-08-14', time '02:00', sh_night) returning id into j;
  select operating_date into od from jobs where id = j;
  if od <> date '2026-08-13' then raise exception 'FAIL: 02:00 night job got operating_date % (expected 13th)', od; end if;

  -- (2) night shift, 23:00 → same operating day
  insert into jobs(tenant_id, service_line_id, customer_id, status, scheduled_date, scheduled_start, shift_id)
    values (t, sl, cust, 'scheduled', date '2026-08-14', time '23:00', sh_night) returning id into j;
  select operating_date into od from jobs where id = j;
  if od <> date '2026-08-14' then raise exception 'FAIL: 23:00 night job got operating_date %', od; end if;

  -- (3) day shift, 09:00 → same operating day
  insert into jobs(tenant_id, service_line_id, customer_id, status, scheduled_date, scheduled_start, shift_id)
    values (t, sl, cust, 'scheduled', date '2026-08-14', time '09:00', sh_day) returning id into j;
  select operating_date into od from jobs where id = j;
  if od <> date '2026-08-14' then raise exception 'FAIL: day job got operating_date %', od; end if;

  -- (4) no shift → operating = scheduled (back-compat for every existing job)
  insert into jobs(tenant_id, service_line_id, customer_id, status, scheduled_date)
    values (t, sl, cust, 'scheduled', date '2026-08-14') returning id into j;
  select operating_date into od from jobs where id = j;
  if od <> date '2026-08-14' then raise exception 'FAIL: shiftless job got operating_date %', od; end if;

  raise notice 'SHIFT OPERATING-DAY TESTS PASSED';
end $$;
rollback;
