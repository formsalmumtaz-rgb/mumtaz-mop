-- invariants.sql — proves the structural invariants that are enforced IN the
-- database (SCHEMA.md §2, §3). Wrapped in a transaction that ROLLS BACK, so it
-- leaves no data behind. Run:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/tests/invariants.sql
-- PASS = prints 'ALL INVARIANT CHECKS PASSED'; any failure raises.

begin;
do $$
declare
  v_tenant uuid; v_sl uuid;
  v_audit bigint; v_item uuid; v_sm uuid;
  v_acc_dr uuid; v_acc_cr uuid; v_entry uuid;
  v_recipe uuid; v_rv uuid;
  ok boolean;
begin
  select id into v_tenant from tenants where name = 'Mumtaz Integrated Services Group';
  select id into v_sl from service_lines where tenant_id = v_tenant and code = 'pest_control';

  -- (1) append-only: audit_log rejects UPDATE and DELETE
  insert into audit_log(tenant_id, table_name, action) values (v_tenant, 'test', 'insert') returning id into v_audit;
  ok := false; begin update audit_log set note = 'x' where id = v_audit; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: audit_log was UPDATE-able'; end if;
  ok := false; begin delete from audit_log where id = v_audit; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: audit_log was DELETE-able'; end if;

  -- (2) append-only: stock_movements rejects UPDATE
  insert into items(tenant_id, service_line_id, name, item_type) values (v_tenant, v_sl, 'Test Chem', 'chemical') returning id into v_item;
  insert into stock_movements(tenant_id, service_line_id, item_id, movement_type, quantity)
    values (v_tenant, v_sl, v_item, 'consumption', 10) returning id into v_sm;
  ok := false; begin update stock_movements set quantity = 99 where id = v_sm; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: stock_movements was UPDATE-able'; end if;

  -- (3) debits = credits enforced in the DB
  insert into accounts(tenant_id, code, name, account_type) values (v_tenant, 'TDR', 'Test Dr', 'expense') returning id into v_acc_dr;
  insert into accounts(tenant_id, code, name, account_type) values (v_tenant, 'TCR', 'Test Cr', 'asset')   returning id into v_acc_cr;
  -- unbalanced entry is rejected
  insert into journal_entries(tenant_id, service_line_id, memo) values (v_tenant, v_sl, 'unbalanced') returning id into v_entry;
  ok := false;
  begin
    insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit) values (v_tenant, v_entry, v_acc_dr, 100, 0);
    set constraints journal_lines_balanced immediate;   -- force the deferred check now
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: unbalanced journal entry was accepted'; end if;
  set constraints journal_lines_balanced deferred;
  -- balanced entry is accepted
  insert into journal_entries(tenant_id, service_line_id, memo) values (v_tenant, v_sl, 'balanced') returning id into v_entry;
  insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit) values (v_tenant, v_entry, v_acc_dr, 100, 0);
  insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit) values (v_tenant, v_entry, v_acc_cr, 0, 100);
  set constraints journal_lines_balanced immediate;      -- must pass
  set constraints journal_lines_balanced deferred;

  -- (4) version immutability: recipe version values cannot change; only close
  insert into treatment_recipes(tenant_id, service_line_id, code, name) values (v_tenant, v_sl, 'TR', 'Test Recipe') returning id into v_recipe;
  insert into treatment_recipe_versions(recipe_id, version_no, dose_rate) values (v_recipe, 1, 5.0) returning id into v_rv;
  ok := false; begin update treatment_recipe_versions set dose_rate = 9.0 where id = v_rv; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: recipe version value was mutable'; end if;
  begin
    update treatment_recipe_versions set effective_to = current_date where id = v_rv;   -- closing is allowed
  exception when others then raise exception 'FAIL: could not close a recipe version: %', sqlerrm;
  end;

  raise notice 'ALL INVARIANT CHECKS PASSED';
end $$;
rollback;
