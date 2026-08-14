-- preflight_authority.sql — Vision P5 negative tests.
-- 1) An actor WITHOUT preflight.submit cannot insert a pre-flight (DB trigger
--    enforce_preflight_authority, mig 066) — hidden buttons are not access
--    control; the database is the boundary.
-- 2) shift_confirmations (attendance) is append-only (mig 086).
-- Pure SQL, wraps in one transaction, rolls back — leaves no residue.
begin;

do $$
declare
  v_t uuid;
  v_tech uuid;
  v_user uuid := gen_random_uuid();
  v_role uuid;
  v_failed boolean := false;
begin
  select id into v_t from tenants where name = 'Mumtaz Integrated Services Group';
  select id into v_tech from technicians where tenant_id = v_t limit 1;

  -- an app user holding ONLY the technician role (no preflight.submit)
  insert into app_users (id, tenant_id, email, full_name, is_active)
  values (v_user, v_t, 'negtest-tech@example.com', 'Negative Test Tech', true);
  select id into v_role from roles where tenant_id = v_t and code = 'technician';
  insert into user_roles (tenant_id, user_id, role_id) values (v_t, v_user, v_role);

  -- act as that user
  perform set_config('app.current_tenant', v_t::text, true);
  perform set_config('app.current_actor', v_user::text, true);

  begin
    insert into preflight_checks (tenant_id, technician_id, check_date, payload)
    values (v_t, v_tech, current_date + 30, '{}'::jsonb);
    v_failed := false;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'NEGATIVE TEST FAILED: plain technician inserted a pre-flight';
  end if;
  raise notice 'PASS: plain technician blocked from pre-flight submit (DB trigger)';

  -- clear actor (back to maintenance context) for the append-only check
  perform set_config('app.current_actor', '', true);

  -- 2) attendance record is append-only
  declare v_conf uuid;
  begin
    insert into shift_confirmations (tenant_id, technician_id, shift_date)
    values (v_t, v_tech, current_date + 30) returning id into v_conf;
    begin
      update shift_confirmations set shift_date = current_date + 31 where id = v_conf;
      raise exception 'NEGATIVE TEST FAILED: shift_confirmations UPDATE allowed';
    exception when others then
      if sqlerrm like '%NEGATIVE TEST FAILED%' then raise; end if;
      raise notice 'PASS: shift_confirmations UPDATE rejected (append-only)';
    end;
    begin
      delete from shift_confirmations where id = v_conf;
      raise exception 'NEGATIVE TEST FAILED: shift_confirmations DELETE allowed';
    exception when others then
      if sqlerrm like '%NEGATIVE TEST FAILED%' then raise; end if;
      raise notice 'PASS: shift_confirmations DELETE rejected (append-only)';
    end;
  end;

  raise notice 'ALL PRE-FLIGHT AUTHORITY / ATTENDANCE CHECKS PASSED';
end $$;

rollback;
select 'RESULT: PREFLIGHT AUTHORITY TEST COMPLETED' as result;
