-- 035_receipts_payments.sql
-- Back Office Revenue Loop, milestone 3: Receipts & Payments (subledger only).
-- Per FINANCE_ARCHITECTURE.md §3.2 — no GL posting (unified engine later).
--
--  * receipts (append-only) + receipt_allocations (append-only): one receipt may
--    settle many invoices; one invoice may take many receipts.
--  * RCP/YY/NNNNN numbering (mig 033).
--  * Allocation rules enforced deterministically in fn_record_receipt:
--      - a receipt is fully applied (sum of allocations = amount);
--      - never over-allocate beyond an invoice's outstanding balance;
--      - CONTRACT invoices may be part-paid; AD-HOC invoices must be paid in full;
--      - only issued/queued invoices of the same customer can be settled.
--  * invoice_ar view: authoritative balance / payment_status / ageing bucket.
--  * When a receipt clears an invoice, its lifecycle flips to 'paid'.

-- 'RCP' document series for every tenant
insert into document_counters (tenant_id, series_key, prefix, pad_width, next_value, is_assumed)
select t.id, 'RCP', 'RCP', 5, 1, false from tenants t
on conflict (tenant_id, series_key) do nothing;

-- ── Receipts (append-only) ────────────────────────────────────────────────
create table receipts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  receipt_number  text,
  customer_id     uuid references customers(id),
  receipt_date    date not null default current_date,
  method          text not null check (method in ('cash','card','bank_transfer','cheque','other')),
  amount          numeric not null check (amount > 0),
  reference       text,                          -- cheque no / txn ref
  others_note     text,                          -- required when method='other'
  notes           text,
  created_at      timestamptz not null default now(), created_by uuid,
  check (method <> 'other' or nullif(trim(coalesce(others_note,'')),'') is not null)
);
create index receipts_customer_idx on receipts (tenant_id, customer_id);
create trigger receipts_append_only before update or delete on receipts
  for each row execute function enforce_append_only();
alter table receipts enable row level security;
create policy tenant_isolation on receipts using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on receipts to mop_app;

-- ── Receipt allocations (append-only) ─────────────────────────────────────
create table receipt_allocations (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  receipt_id   uuid not null references receipts(id),
  invoice_id   uuid not null references invoices(id),
  amount       numeric not null check (amount > 0),
  created_at   timestamptz not null default now(), created_by uuid
);
create index receipt_allocations_receipt_idx on receipt_allocations (receipt_id);
create index receipt_allocations_invoice_idx on receipt_allocations (invoice_id);
create trigger receipt_allocations_append_only before update or delete on receipt_allocations
  for each row execute function enforce_append_only();
alter table receipt_allocations enable row level security;
create policy tenant_isolation on receipt_allocations using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on receipt_allocations to mop_app;

-- ── AR view: authoritative balance, payment status, ageing ────────────────
create view invoice_ar with (security_invoker = true) as
select i.tenant_id, i.id as invoice_id, i.invoice_number, i.customer_id, i.contract_id,
       i.status, i.issue_date, i.due_date, i.currency, i.total::numeric as total,
       coalesce(a.allocated, 0) as allocated,
       (i.total - coalesce(a.allocated, 0)) as balance,
       (i.contract_id is not null) as is_contract_invoice,
       case when (i.total - coalesce(a.allocated,0)) <= 0 then 'paid'
            when coalesce(a.allocated,0) > 0 then 'partial'
            else 'unpaid' end as payment_status,
       case when i.due_date is null then 0 else greatest(0, (current_date - i.due_date)) end as days_overdue,
       case when (i.total - coalesce(a.allocated,0)) <= 0 then 'paid'
            when i.due_date is null or current_date <= i.due_date then 'current'
            when current_date - i.due_date <= 30  then '1-30'
            when current_date - i.due_date <= 60  then '31-60'
            when current_date - i.due_date <= 90  then '61-90'
            when current_date - i.due_date <= 120 then '91-120'
            else '120+' end as aging_bucket
from invoices i
left join (select invoice_id, sum(amount) as allocated from receipt_allocations group by invoice_id) a
  on a.invoice_id = i.id
where i.document_type = 'tax_invoice' and i.status <> 'cancelled';
grant select on invoice_ar to mop_app;

-- ── Record a receipt and its allocations, atomically & deterministically ──
-- p_allocations: jsonb array of {"invoice_id": uuid, "amount": number}.
create or replace function fn_record_receipt(
  p_tenant uuid, p_customer uuid, p_date date, p_method text, p_amount numeric,
  p_reference text, p_others_note text, p_allocations jsonb
) returns uuid language plpgsql as $$
declare
  v_receipt uuid; v_num text; v_sum numeric; a jsonb;
  v_inv record; v_bal numeric; v_amt numeric;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Receipt amount must be > 0'; end if;
  if p_method = 'other' and nullif(trim(coalesce(p_others_note,'')),'') is null then
    raise exception 'A note is required when the payment method is "other"'; end if;

  select coalesce(sum((x->>'amount')::numeric), 0) into v_sum from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) x;
  if round(v_sum, 2) <> round(p_amount, 2) then
    raise exception 'Allocations (%.2f) must equal the receipt amount (%.2f)', v_sum, p_amount; end if;

  v_num := fn_next_document_number(p_tenant, 'RCP');
  insert into receipts (tenant_id, customer_id, receipt_number, receipt_date, method, amount, reference, others_note)
    values (p_tenant, p_customer, v_num, coalesce(p_date, current_date), p_method, p_amount, nullif(trim(coalesce(p_reference,'')),''), nullif(trim(coalesce(p_others_note,'')),''))
    returning id into v_receipt;

  for a in select * from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) loop
    v_amt := (a->>'amount')::numeric;
    if v_amt <= 0 then raise exception 'Allocation amount must be > 0'; end if;
    select i.id, i.contract_id, i.status, i.customer_id, i.total,
           i.total - coalesce((select sum(amount) from receipt_allocations ra where ra.invoice_id = i.id),0) as balance
      into v_inv
      from invoices i where i.id = (a->>'invoice_id')::uuid and i.tenant_id = p_tenant for update;
    if not found then raise exception 'Invoice % not found', a->>'invoice_id'; end if;
    if v_inv.status not in ('issued','queued') then raise exception 'Invoice % is not open for payment (status=%)', v_inv.id, v_inv.status; end if;
    if p_customer is not null and v_inv.customer_id is distinct from p_customer then
      raise exception 'Invoice % belongs to a different customer', v_inv.id; end if;
    if v_amt > v_inv.balance + 0.005 then raise exception 'Allocation %.2f exceeds invoice % balance %.2f', v_amt, v_inv.id, v_inv.balance; end if;
    if v_inv.contract_id is null and round(v_amt,2) <> round(v_inv.balance,2) then
      raise exception 'Ad-hoc invoice % must be paid in full (balance %.2f)', v_inv.id, v_inv.balance; end if;

    insert into receipt_allocations (tenant_id, receipt_id, invoice_id, amount)
      values (p_tenant, v_receipt, v_inv.id, v_amt);

    if round(v_inv.balance - v_amt, 2) <= 0 then
      update invoices set status = 'paid' where id = v_inv.id;
    end if;
  end loop;

  return v_receipt;
end $$;
