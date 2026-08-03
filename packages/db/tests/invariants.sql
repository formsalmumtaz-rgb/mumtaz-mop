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
  v_batch uuid; v_purchase uuid;
  v_tech uuid; v_cost uuid;
  v_veh uuid; v_fuel uuid;
  v_cust uuid; v_job uuid; v_jc uuid;
  v_sr uuid; v_srr uuid; v_sra uuid;
  v_rcp uuid; v_rca uuid; v_inv uuid; v_rfd uuid;
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

  -- (5) append-only: item_purchases rejects UPDATE and DELETE (mig 016)
  insert into item_batches(tenant_id, item_id, batch_no, unit_cost)
    values (v_tenant, v_item, 'INV-TEST', 0.01) returning id into v_batch;
  insert into item_purchases(tenant_id, service_line_id, item_id, batch_id,
      pack_quantity, pack_size, total_base_quantity, total_cost)
    values (v_tenant, v_sl, v_item, v_batch, 1, 10, 10000, 100) returning id into v_purchase;
  ok := false; begin update item_purchases set total_cost = 999 where id = v_purchase; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: item_purchases was UPDATE-able'; end if;
  ok := false; begin delete from item_purchases where id = v_purchase; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: item_purchases was DELETE-able'; end if;

  -- (6) frozen valuation basis: item_batches.unit_cost is immutable once set (mig 016)
  ok := false; begin update item_batches set unit_cost = 0.02 where id = v_batch; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: item_batches.unit_cost was mutable after being set'; end if;

  -- (7) version immutability: employee_cost_components value columns cannot change;
  -- delete is blocked; only effective_to may close (mig 019)
  select id into v_tech from technicians where tenant_id = v_tenant limit 1;
  insert into employee_cost_components(tenant_id, service_line_id, technician_id, version_no, basic_salary)
    values (v_tenant, v_sl, v_tech, 1, 1600) returning id into v_cost;
  ok := false; begin update employee_cost_components set basic_salary = 9999 where id = v_cost; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: employee_cost_components value column was mutable'; end if;
  ok := false; begin delete from employee_cost_components where id = v_cost; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: employee_cost_components was DELETE-able'; end if;
  begin
    update employee_cost_components set effective_to = current_date where id = v_cost;   -- closing allowed
  exception when others then raise exception 'FAIL: could not close an employee_cost_components version: %', sqlerrm;
  end;

  -- (8) append-only: vehicle_fuel_purchases rejects UPDATE and DELETE (mig 022)
  insert into vehicles(tenant_id, service_line_id, code, name) values (v_tenant, v_sl, 'INV-VAN', 'Inv Van') returning id into v_veh;
  insert into vehicle_fuel_purchases(tenant_id, service_line_id, vehicle_id, litres, amount, odometer_km)
    values (v_tenant, v_sl, v_veh, 40, 200, 10000) returning id into v_fuel;
  ok := false; begin update vehicle_fuel_purchases set amount = 999 where id = v_fuel; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: vehicle_fuel_purchases was UPDATE-able'; end if;
  ok := false; begin delete from vehicle_fuel_purchases where id = v_fuel; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: vehicle_fuel_purchases was DELETE-able'; end if;

  -- (9) append-only: job_costs rejects UPDATE and DELETE (mig 023 — frozen cost snapshot)
  select id into v_cust from customers where tenant_id = v_tenant limit 1;
  insert into jobs(tenant_id, service_line_id, customer_id, status) values (v_tenant, v_sl, v_cust, 'completed') returning id into v_job;
  insert into job_costs(tenant_id, service_line_id, job_id, labour_cost, cost_confidence) values (v_tenant, v_sl, v_job, 50, 'estimated') returning id into v_jc;
  ok := false; begin update job_costs set labour_cost = 999 where id = v_jc; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: job_costs was UPDATE-able'; end if;
  ok := false; begin delete from job_costs where id = v_jc; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: job_costs was DELETE-able'; end if;

  -- (10) append-only: service_report_reviews + service_report_attachments (mig 033)
  insert into service_reports(tenant_id, service_line_id, job_id, customer_id, report_number)
    values (v_tenant, v_sl, v_job, v_cust, fn_next_document_number(v_tenant,'SR')) returning id into v_sr;
  insert into service_report_reviews(tenant_id, service_report_id, action) values (v_tenant, v_sr, 'approved') returning id into v_srr;
  ok := false; begin update service_report_reviews set action='rejected' where id = v_srr; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: service_report_reviews was UPDATE-able'; end if;
  ok := false; begin delete from service_report_reviews where id = v_srr; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: service_report_reviews was DELETE-able'; end if;
  insert into service_report_attachments(tenant_id, service_report_id, kind, storage_key) values (v_tenant, v_sr, 'photo', 'k/x.jpg') returning id into v_sra;
  ok := false; begin update service_report_attachments set storage_key='y' where id = v_sra; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: service_report_attachments was UPDATE-able'; end if;
  ok := false; begin delete from service_report_attachments where id = v_sra; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: service_report_attachments was DELETE-able'; end if;

  -- (11) append-only: receipts + receipt_allocations (mig 035)
  insert into receipts(tenant_id, customer_id, receipt_number, method, amount)
    values (v_tenant, v_cust, fn_next_document_number(v_tenant,'RCP'), 'cash', 100) returning id into v_rcp;
  ok := false; begin update receipts set amount=999 where id=v_rcp; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: receipts was UPDATE-able'; end if;
  ok := false; begin delete from receipts where id=v_rcp; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: receipts was DELETE-able'; end if;
  insert into invoices(tenant_id, service_line_id, customer_id, status, total) values (v_tenant, v_sl, v_cust, 'issued', 100) returning id into v_inv;
  insert into receipt_allocations(tenant_id, receipt_id, invoice_id, amount) values (v_tenant, v_rcp, v_inv, 100) returning id into v_rca;
  ok := false; begin update receipt_allocations set amount=1 where id=v_rca; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: receipt_allocations was UPDATE-able'; end if;
  ok := false; begin delete from receipt_allocations where id=v_rca; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: receipt_allocations was DELETE-able'; end if;

  -- (12) append-only: refunds (mig 036)
  insert into refunds(tenant_id, customer_id, refund_number, method, amount)
    values (v_tenant, v_cust, fn_next_document_number(v_tenant,'RFD'), 'cash', 25) returning id into v_rfd;
  ok := false; begin update refunds set amount=999 where id=v_rfd; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: refunds was UPDATE-able'; end if;
  ok := false; begin delete from refunds where id=v_rfd; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: refunds was DELETE-able'; end if;

  -- (13) append-only: billing_failures (mig 038)
  declare v_bf uuid;
  begin
    insert into billing_failures(tenant_id, contract_id, period, error_text) values (v_tenant, null, current_date, 'test') returning id into v_bf;
    ok := false; begin update billing_failures set error_text='x' where id = v_bf; exception when others then ok := true; end;
    if not ok then raise exception 'FAIL: billing_failures was UPDATE-able'; end if;
    ok := false; begin delete from billing_failures where id = v_bf; exception when others then ok := true; end;
    if not ok then raise exception 'FAIL: billing_failures was DELETE-able'; end if;
  end;

  raise notice 'ALL INVARIANT CHECKS PASSED';
end $$;
rollback;
