-- 036_credit_notes_refunds.sql
-- Back Office Revenue Loop, milestone 4: Credit Notes & Refunds (subledger only;
-- no GL posting — per FINANCE_ARCHITECTURE.md §3.3–3.4).
--
--  * credit_notes + credit_note_lines: linked to an original invoice, own CRN
--    series, full or PARTIAL credit. Draft→issued lifecycle (content frozen at
--    issue); cancel keeps the number reserved. A credit note reduces the net
--    receivable on its invoice.
--  * refunds (append-only): cash outflow against a credit note, own RFD series,
--    same payment methods as receipts.
--  * invoice_ar rebuilt to subtract issued credits: balance = total − credited −
--    allocated.

-- CRN + RFD document series for every tenant
insert into document_counters (tenant_id, series_key, prefix, pad_width, next_value, is_assumed)
select t.id, v.k, v.p, 5, 1, false from tenants t
cross join (values ('CRN','CRN'), ('RFD','RFD')) as v(k, p)
on conflict (tenant_id, series_key) do nothing;

-- ── Credit notes (draft→issued lifecycle; content frozen at issue) ─────────
create table credit_notes (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id),
  service_line_id    uuid references service_lines(id),
  credit_note_number text,
  customer_id        uuid references customers(id),
  invoice_id         uuid references invoices(id),      -- the invoice being credited (nullable = general)
  issue_date         date,
  vat_treatment      text not null default 'standard' check (vat_treatment in ('standard','zero_rated','exempt','reverse_charge')),
  subtotal           numeric not null default 0,
  vat_total          numeric not null default 0,
  total              numeric not null default 0,
  reason             text,
  status             text not null default 'draft' check (status in ('draft','issued','cancelled')),
  cancelled_at       timestamptz, cancelled_reason text, cancelled_by uuid,
  snapshot           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(), created_by uuid,
  updated_at         timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, credit_note_number)
);
create index credit_notes_invoice_idx on credit_notes (invoice_id);
create index credit_notes_customer_idx on credit_notes (tenant_id, customer_id);
create trigger credit_notes_touch before update on credit_notes for each row execute function set_updated_at();
alter table credit_notes enable row level security;
create policy tenant_isolation on credit_notes using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on credit_notes to mop_app;

create table credit_note_lines (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  credit_note_id  uuid not null references credit_notes(id) on delete cascade,
  line_no         integer,
  description     text,
  quantity        numeric not null default 1,
  unit_price      numeric not null default 0,
  currency        text not null default 'AED',
  vat_rate        numeric not null default 0,
  vat_amount      numeric not null default 0,
  line_total      numeric not null default 0,
  created_at      timestamptz not null default now(), created_by uuid
);
create index credit_note_lines_cn_idx on credit_note_lines (credit_note_id);
alter table credit_note_lines enable row level security;
create policy tenant_isolation on credit_note_lines using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on credit_note_lines to mop_app;

-- ── Refunds (append-only) ─────────────────────────────────────────────────
create table refunds (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  refund_number   text,
  customer_id     uuid references customers(id),
  credit_note_id  uuid references credit_notes(id),
  refund_date     date not null default current_date,
  method          text not null check (method in ('cash','card','bank_transfer','cheque','other')),
  amount          numeric not null check (amount > 0),
  reference       text,
  others_note     text,
  notes           text,
  created_at      timestamptz not null default now(), created_by uuid,
  check (method <> 'other' or nullif(trim(coalesce(others_note,'')),'') is not null)
);
create index refunds_cn_idx on refunds (credit_note_id);
create trigger refunds_append_only before update or delete on refunds
  for each row execute function enforce_append_only();
alter table refunds enable row level security;
create policy tenant_isolation on refunds using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on refunds to mop_app;

-- ── Issue a credit note: assign CRN, freeze, set issue date ───────────────
create or replace function fn_issue_credit_note(p_cn uuid)
returns text language plpgsql as $$
declare cn record; v_num text;
begin
  select * into cn from credit_notes where id = p_cn for update;
  if not found then raise exception 'Credit note not found'; end if;
  if cn.status <> 'draft' then raise exception 'Only draft credit notes can be issued (status=%)', cn.status; end if;
  v_num := coalesce(cn.credit_note_number, fn_next_document_number(cn.tenant_id, 'CRN'));
  update credit_notes set credit_note_number = v_num, status = 'issued', issue_date = coalesce(issue_date, current_date) where id = p_cn;
  return v_num;
end $$;

-- ── AR view rebuilt: net of issued credit notes and receipt allocations ───
drop view if exists invoice_ar;
create view invoice_ar with (security_invoker = true) as
select i.tenant_id, i.id as invoice_id, i.invoice_number, i.customer_id, i.contract_id,
       i.status, i.issue_date, i.due_date, i.currency, i.total::numeric as total,
       coalesce(cr.credited, 0) as credited,
       coalesce(a.allocated, 0) as allocated,
       (i.total - coalesce(cr.credited,0) - coalesce(a.allocated, 0)) as balance,
       (i.contract_id is not null) as is_contract_invoice,
       case when (i.total - coalesce(cr.credited,0) - coalesce(a.allocated,0)) <= 0 then 'paid'
            when coalesce(a.allocated,0) > 0 or coalesce(cr.credited,0) > 0 then 'partial'
            else 'unpaid' end as payment_status,
       case when i.due_date is null then 0 else greatest(0, (current_date - i.due_date)) end as days_overdue,
       case when (i.total - coalesce(cr.credited,0) - coalesce(a.allocated,0)) <= 0 then 'paid'
            when i.due_date is null or current_date <= i.due_date then 'current'
            when current_date - i.due_date <= 30  then '1-30'
            when current_date - i.due_date <= 60  then '31-60'
            when current_date - i.due_date <= 90  then '61-90'
            when current_date - i.due_date <= 120 then '91-120'
            else '120+' end as aging_bucket
from invoices i
left join (select invoice_id, sum(amount) as allocated from receipt_allocations group by invoice_id) a on a.invoice_id = i.id
left join (select invoice_id, sum(total) as credited from credit_notes where status='issued' and invoice_id is not null group by invoice_id) cr on cr.invoice_id = i.id
where i.document_type = 'tax_invoice' and i.status <> 'cancelled';
grant select on invoice_ar to mop_app;
