-- 135_a_confirmed_day_is_closed.sql
-- The day-close ends with a supervisor putting their name to a set of figures.
-- 127 made sure a confirmation names its words and its owner. It did not stop
-- the figures moving AFTERWARDS: postflight_authority checks WHO is writing,
-- never whether the day is already signed. So the odometer, the fuel level, the
-- equipment ticks and the incident note could all be changed after signature,
-- and the record would still read as confirmed.
--
-- A signature that does not fix what was signed is decoration. Once confirmed,
-- the day is closed: corrections are the office's to make against the record,
-- not an edit to it.

create or replace function enforce_postflight_frozen() returns trigger
language plpgsql as $$
begin
  if old.accountability_confirmed then
    -- Everything the confirmation covers is fixed. updated_at/updated_by may
    -- still move so an attempted touch is still attributable.
    if new.odometer_km            is distinct from old.odometer_km
    or new.fuel_band              is distinct from old.fuel_band
    or new.equipment              is distinct from old.equipment
    or new.stock_returned         is distinct from old.stock_returned
    or new.incidents              is distinct from old.incidents
    or new.vehicle_id             is distinct from old.vehicle_id
    or new.check_date             is distinct from old.check_date
    or new.technician_id          is distinct from old.technician_id
    or new.accountability_statement is distinct from old.accountability_statement
    or new.confirmed_by           is distinct from old.confirmed_by
    or new.confirmed_at           is distinct from old.confirmed_at
    or new.accountability_confirmed is distinct from old.accountability_confirmed then
      raise exception
        'The day of % was confirmed at % and is closed. Correct it in the office against the record, not by editing it.',
        old.check_date, to_char(old.confirmed_at, 'YYYY-MM-DD HH24:MI');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists postflight_frozen on postflight_checks;
create trigger postflight_frozen
  before update on postflight_checks
  for each row execute function enforce_postflight_frozen();

-- The counted-back chemical is part of what was signed for, so it freezes with
-- the rest. Before confirmation it stays fully correctable — a lead who counts,
-- gets called away and comes back must not have to start again.
create or replace function enforce_postflight_stock_frozen() returns trigger
language plpgsql as $$
declare v_confirmed boolean; v_date date;
begin
  select p.accountability_confirmed, p.check_date into v_confirmed, v_date
    from postflight_checks p
   where p.id = coalesce(new.postflight_check_id, old.postflight_check_id);
  -- No parent row means the parent is being deleted and this is the cascade
  -- following it down. Nothing is being changed behind a signature; let it go.
  if not found then return coalesce(new, old); end if;
  if v_confirmed then
    raise exception
      'The chemical count for % is part of a day that has been confirmed. It cannot be changed.', v_date;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists postflight_stock_frozen on postflight_stock_declarations;
create trigger postflight_stock_frozen
  before insert or update or delete on postflight_stock_declarations
  for each row execute function enforce_postflight_stock_frozen();

comment on function enforce_postflight_frozen() is
  'Freezes a day once its accountability confirmation is given (Art. VII §2 in spirit: the record stands, corrections are made against it).';
