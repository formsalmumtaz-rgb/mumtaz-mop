-- 038_recurring_contract_billing.sql
-- Recurring Contract Billing & Invoice Automation. Deterministic, idempotent
-- recurring invoice generation driven by the contract's own payment terms.
-- Extends the existing contract + invoice + GL machinery (no billing logic is
-- duplicated): generation builds a normal invoice, issues it via fn_issue_invoice
-- (AMTX numbering) and posts it via fn_post_invoice_gl. Per-visit billing is
-- unchanged — it stays on the Service-Report-gated job.completed path.

-- ── Contract billing fields ───────────────────────────────────────────────
alter table contracts add column billing_frequency text
  check (billing_frequency is null or billing_frequency in ('per_visit','weekly','monthly','quarterly','half_yearly','yearly','custom'));
alter table contracts add column billing_interval_days integer check (billing_interval_days is null or billing_interval_days > 0); -- for 'custom'
alter table contracts add column billing_day integer check (billing_day is null or billing_day between 1 and 31);                    -- day-of-month for month-based
alter table contracts add column next_invoice_date date;
alter table contracts add column last_invoice_date date;
alter table contracts add column auto_generate_invoice boolean not null default false;

-- ── Invoice period marker + hard idempotency guard ────────────────────────
alter table invoices add column billing_period date;   -- the recurring period this invoice covers
-- At most ONE tax invoice per contract per billing period, ever (any status —
-- a cancelled auto-invoice still consumed its period; re-billing is manual).
create unique index invoices_contract_period_uk
  on invoices (tenant_id, contract_id, billing_period)
  where billing_period is not null and document_type = 'tax_invoice';

-- ── Billing failures (append-only; surfaced on the billing dashboard) ──────
create table billing_failures (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  contract_id uuid references contracts(id),
  period      date,
  error_text  text,
  created_at  timestamptz not null default now()
);
create index billing_failures_tenant_idx on billing_failures (tenant_id, created_at desc);
create trigger billing_failures_append_only before update or delete on billing_failures
  for each row execute function enforce_append_only();
alter table billing_failures enable row level security;
create policy tenant_isolation on billing_failures using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on billing_failures to mop_app;

-- ── Deterministic date advancement (pure) ─────────────────────────────────
create or replace function fn_advance_billing_date(p_date date, p_freq text, p_interval_days integer, p_billing_day integer)
returns date language plpgsql immutable as $$
declare n integer; v_next date; v_month_start date; v_days_in_month integer;
begin
  if p_freq = 'weekly' then return p_date + 7; end if;
  if p_freq = 'custom' then return p_date + coalesce(p_interval_days, 30); end if;
  n := case p_freq when 'monthly' then 1 when 'quarterly' then 3 when 'half_yearly' then 6 when 'yearly' then 12 else null end;
  if n is null then return null; end if;   -- per_visit / unknown are not date-driven
  v_next := (p_date + (n || ' months')::interval)::date;
  if p_billing_day is not null then
    v_month_start := date_trunc('month', v_next)::date;
    v_days_in_month := (date_trunc('month', v_next) + interval '1 month - 1 day')::date - v_month_start + 1;
    v_next := v_month_start + (least(p_billing_day, v_days_in_month) - 1);
  end if;
  return v_next;
end $$;

-- ── Generate ONE contract invoice for a period (deterministic + idempotent) ─
-- Builds the invoice from active contract_services (fallback: contract_value),
-- applies VAT per the contract's treatment, then issues + posts it. Returns the
-- invoice id, or NULL when nothing was generated (already billed / not eligible
-- / nothing to bill).
create or replace function fn_generate_contract_invoice(p_contract uuid, p_period date)
returns uuid language plpgsql as $$
declare ct record; v_inv uuid; v_rate numeric; v_def_rate numeric;
begin
  select * into ct from contracts where id = p_contract for update;
  if not found or ct.lifecycle_status <> 'active' then return null; end if;
  if not coalesce(ct.auto_generate_invoice, false) then return null; end if;
  if ct.billing_frequency is null or ct.billing_frequency = 'per_visit' then return null; end if;
  if ct.start_date is not null and p_period < ct.start_date then return null; end if;
  if ct.end_date is not null and p_period > ct.end_date then return null; end if;
  if exists (select 1 from invoices where tenant_id=ct.tenant_id and contract_id=p_contract and billing_period=p_period and document_type='tax_invoice') then
    return null;  -- already billed for this period (idempotent)
  end if;

  v_def_rate := coalesce((select value::text::numeric from settings where tenant_id=ct.tenant_id and service_line_id is null and key='ar.default_vat_rate'), 5);
  v_rate := case when ct.vat_treatment = 'standard' then v_def_rate else 0 end;

  insert into invoices(tenant_id, service_line_id, document_type, customer_id, contract_id, status, vat_treatment, billing_period,
                       buyer_legal_name, buyer_trn, buyer_address, buyer_customer_type, currency, subtotal, vat_total, total)
    select ct.tenant_id, ct.service_line_id, 'tax_invoice', ct.customer_id, ct.id, 'draft', ct.vat_treatment, p_period,
           coalesce(cu.legal_name, cu.trade_name), cu.trn, cu.emirate, cu.customer_type, coalesce(ct.currency,'AED'), 0, 0, 0
      from customers cu where cu.id = ct.customer_id
    returning id into v_inv;

  insert into invoice_lines(tenant_id, invoice_id, line_no, description, service_type_id, quantity, unit_price, currency, vat_rate, vat_amount, line_total)
    select ct.tenant_id, v_inv, row_number() over (order by cs.created_at), coalesce(st.name,'Contract service'),
           cs.service_type_id, cs.quantity, coalesce(cs.unit_price,0), coalesce(cs.currency,'AED'),
           v_rate, round(coalesce(cs.unit_price,0)*cs.quantity * v_rate / 100, 2), round(coalesce(cs.unit_price,0)*cs.quantity, 2)
      from contract_services cs left join service_types st on st.id = cs.service_type_id
     where cs.contract_id = ct.id and cs.tenant_id = ct.tenant_id and cs.is_active;

  if not exists (select 1 from invoice_lines where invoice_id = v_inv) and coalesce(ct.contract_value,0) > 0 then
    insert into invoice_lines(tenant_id, invoice_id, line_no, description, quantity, unit_price, currency, vat_rate, vat_amount, line_total)
      values (ct.tenant_id, v_inv, 1, 'Contract charge', 1, ct.contract_value, coalesce(ct.currency,'AED'),
              v_rate, round(ct.contract_value*v_rate/100,2), round(ct.contract_value,2));
  end if;

  if not exists (select 1 from invoice_lines where invoice_id = v_inv) then
    delete from invoices where id = v_inv;   -- nothing to bill
    return null;
  end if;

  update invoices i set subtotal=t.s, vat_total=t.v, total=t.s+t.v
    from (select coalesce(sum(line_total),0) s, coalesce(sum(vat_amount),0) v from invoice_lines where invoice_id=v_inv) t
   where i.id = v_inv;

  perform fn_issue_invoice(v_inv);      -- AMTX number + dates (contract-linked, no SR gate)
  perform fn_post_invoice_gl(v_inv);    -- unified GL posting
  return v_inv;
end $$;

-- ── Run recurring billing for a tenant up to a date (the worker engine) ────
-- Catches up every due period (including missed ones), advances the schedule,
-- audits each generation, records failures without aborting the run, and is safe
-- to run repeatedly (idempotent via the period guard + advancing next_invoice_date).
create or replace function fn_run_contract_billing(p_tenant uuid, p_as_of date default current_date)
returns integer language plpgsql as $$
declare n integer := 0; ct record; v_period date; v_inv uuid; v_guard integer;
begin
  for ct in
    select * from contracts
     where tenant_id = p_tenant and lifecycle_status = 'active' and coalesce(auto_generate_invoice,false)
       and billing_frequency is not null and billing_frequency <> 'per_visit'
       and next_invoice_date is not null and next_invoice_date <= p_as_of
  loop
    v_guard := 0;
    v_period := ct.next_invoice_date;
    while v_period is not null and v_period <= p_as_of
          and (ct.end_date is null or v_period <= ct.end_date) and v_guard < 240 loop
      begin
        v_inv := fn_generate_contract_invoice(ct.id, v_period);
        if v_inv is not null then
          n := n + 1;
          insert into audit_log(tenant_id, table_name, row_id, action, note)
            values (p_tenant, 'invoices', v_inv::text, 'insert', 'recurring billing: contract '||ct.id||' period '||v_period);
        end if;
        update contracts set last_invoice_date = v_period,
               next_invoice_date = fn_advance_billing_date(v_period, ct.billing_frequency, ct.billing_interval_days, ct.billing_day)
         where id = ct.id;
      exception when others then
        insert into billing_failures(tenant_id, contract_id, period, error_text) values (p_tenant, ct.id, v_period, sqlerrm);
        update contracts set next_invoice_date = fn_advance_billing_date(v_period, ct.billing_frequency, ct.billing_interval_days, ct.billing_day)
         where id = ct.id;   -- advance past the failed period so the run can't loop
      end;
      v_period := (select next_invoice_date from contracts where id = ct.id);
      v_guard := v_guard + 1;
    end loop;
  end loop;
  return n;
end $$;

-- ── Preview upcoming billing (read-only; next occurrence per contract) ─────
create or replace function fn_preview_contract_billing(p_tenant uuid, p_horizon date)
returns table (contract_id uuid, contract_number text, customer text, billing_frequency text, next_invoice_date date, already_billed_to date)
language sql stable as $$
  select c.id, c.contract_number, cu.trade_name, c.billing_frequency, c.next_invoice_date, c.last_invoice_date
    from contracts c left join customers cu on cu.id = c.customer_id
   where c.tenant_id = p_tenant and c.lifecycle_status = 'active' and coalesce(c.auto_generate_invoice,false)
     and c.billing_frequency is not null and c.billing_frequency <> 'per_visit'
     and c.next_invoice_date is not null and c.next_invoice_date <= p_horizon
   order by c.next_invoice_date;
$$;
