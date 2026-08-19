-- 127_postflight_and_accountability.sql
-- §3.7 supervisor extras: the POST-FLIGHT check and the ACCOUNTABILITY
-- CONFIRMATION. Neither existed — the day could be opened but never formally
-- closed, and nobody ever put their name to the figures.
--
-- Why a separate table from preflight_checks rather than more columns on it:
-- they are answered at opposite ends of the day and one must not be able to
-- overwrite the other. A morning correction to the pre-flight should never
-- silently alter what was declared at night, and the pair read together is the
-- day's story — van out, van back.
create table if not exists postflight_checks (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  technician_id   uuid not null references technicians(id),
  check_date      date not null default current_date,
  vehicle_id      uuid references vehicles(id),
  odometer_km     numeric check (odometer_km is null or odometer_km >= 0),
  fuel_band       integer check (fuel_band is null or fuel_band = any (array[0,10,20,40,60,80,99,100])),
  equipment       jsonb,          -- what came back
  stock_returned  jsonb,          -- unused chemical returned to the store
  incidents       text,           -- anything that went wrong, in their words

  -- THE ACCOUNTABILITY CONFIRMATION. Not a tick labelled "OK": the exact wording
  -- agreed to is stored WITH the confirmation, so a year later it is provable
  -- what the person actually put their name to, even if the app's wording has
  -- since changed.
  accountability_confirmed  boolean not null default false,
  accountability_statement  text,
  confirmed_by              uuid,
  confirmed_at              timestamptz,

  client_uuid   uuid,
  device_time   timestamptz,
  time_suspect  boolean not null default false,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  unique (tenant_id, technician_id, check_date)
);

create index if not exists postflight_checks_day_idx on postflight_checks (tenant_id, check_date);

comment on table postflight_checks is
  'End-of-day close by the supervisor: van back, stock returned, incidents, and the accountability confirmation. Paired with preflight_checks, which opens the day (3.7).';
comment on column postflight_checks.accountability_statement is
  'The exact wording confirmed, stored alongside the confirmation. Wording changes over time; what somebody agreed to must not.';

-- A confirmation that records neither its words nor its owner is not a
-- confirmation. Enforced here, not in a screen.
alter table postflight_checks drop constraint if exists postflight_accountability_complete;
alter table postflight_checks add constraint postflight_accountability_complete
  check (not accountability_confirmed
         or (nullif(btrim(coalesce(accountability_statement,'')),'') is not null
             and confirmed_by is not null and confirmed_at is not null));

alter table postflight_checks enable row level security;
drop policy if exists tenant_isolation on postflight_checks;
create policy tenant_isolation on postflight_checks
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update on postflight_checks to mop_app;

-- Same authority as the pre-flight (mig 066): the supervisor closes the day, not
-- whoever happens to be holding the phone.
create or replace function enforce_postflight_authority()
returns trigger language plpgsql as $$
declare v_actor uuid; v_ok boolean;
begin
  begin
    v_actor := nullif(current_setting('app.current_actor', true), '')::uuid;
  exception when others then v_actor := null;
  end;
  if v_actor is null then return new; end if;
  select exists (
    select 1 from user_roles ur
      join role_permissions rp on rp.role_id = ur.role_id
     where ur.user_id = v_actor and ur.tenant_id = new.tenant_id
       and rp.permission_code = 'preflight.submit'
  ) or exists (
    select 1 from technicians t
     where t.tenant_id = new.tenant_id and t.user_id = v_actor and t.is_team_lead
  ) into v_ok;
  if not v_ok then
    raise exception 'only a team lead (or operations/admin) may close the day';
  end if;
  return new;
end $$;
drop trigger if exists postflight_authority on postflight_checks;
create trigger postflight_authority
  before insert or update on postflight_checks
  for each row execute function enforce_postflight_authority();

-- The day, both ends, for the office.
create or replace view technician_day_close as
  select pre.tenant_id, pre.technician_id, t.full_name, pre.check_date,
         pre.present, pre.fuel_band as fuel_out, pre.odometer_km as odo_out,
         post.fuel_band as fuel_in, post.odometer_km as odo_in,
         case when post.odometer_km is not null and pre.odometer_km is not null
              then post.odometer_km - pre.odometer_km end as km_driven,
         post.incidents,
         coalesce(post.accountability_confirmed, false) as day_confirmed,
         post.confirmed_at
    from preflight_checks pre
    join technicians t on t.id = pre.technician_id
    left join postflight_checks post
      on post.tenant_id = pre.tenant_id and post.technician_id = pre.technician_id
     and post.check_date = pre.check_date;

comment on view technician_day_close is
  '3.7: the day read from both ends — van out vs van back, km driven, incidents, and whether anybody confirmed the figures.';

grant select on technician_day_close to mop_app;
