-- 097_account_number_scheme.sql
-- DECISIONS §12 (ratified 19 Aug 2026) — the 5-digit account-number scheme.
--
-- The 5-digit numbers in merge/CUSTOMER_Master_MOP.xlsx (11111–11827, digit 0
-- never used) become THE permanent customer account number. CUST-XXXX is retired.
-- customers.code already holds text with unique (tenant_id, code), so no column
-- changes: only the minting rule changes, and it changes HERE, once, rather than
-- in the three call sites that each had their own copy of it.
--
-- CUST-0001 … CUST-0600 stay burned forever. They live in a different textual
-- namespace ('CUST-%'), so they can never collide with a 5-digit number; the
-- settings row import.next_customer_code is retained as the permanent record of
-- the burn and is deliberately NOT deleted.

-- ── 1. the successor in the zero-free sequence ───────────────────────────────
-- Digit 0 is never used, so 11829 → 11831 and 11899 → 11911. Stepping one at a
-- time is a few iterations in the normal case and at most ~1100 at a decade
-- boundary; correctness is worth more here than arithmetic cleverness.
create or replace function fn_account_no_next(p_from int) returns int
language plpgsql immutable as $$
declare n int := p_from;
begin
  loop
    n := n + 1;
    if n > 99999 then
      raise exception 'account-number space exhausted above % (5 zero-free digits)', p_from;
    end if;
    exit when position('0' in n::text) = 0;
  end loop;
  return n;
end $$;

comment on function fn_account_no_next(int) is
  'DECISIONS §12: next account number in the 5-digit sequence that contains no digit 0.';

-- ── 2. the allocator ─────────────────────────────────────────────────────────
-- The floor is 11827 — the highest number the master file uses — so the first
-- number this platform ever mints is 11828 (DECISIONS §12 ¶3). It rises with the
-- live maximum and skips any number already taken, so a number is never reissued.
-- tenant_id is filtered explicitly and not left to RLS: the CLI importer runs on a
-- privileged connection where RLS does not apply, and a cross-tenant max() there
-- would hand out the wrong number.
create or replace function fn_next_account_nos(p_tenant uuid, p_count int)
returns setof text language plpgsql as $$
declare n int; i int;
begin
  select greatest(11827, coalesce(max(code::int), 0)) into n
    from customers where tenant_id = p_tenant and code ~ '^[1-9]{5}$';
  for i in 1 .. p_count loop
    loop
      n := fn_account_no_next(n);
      exit when not exists (
        select 1 from customers where tenant_id = p_tenant and code = n::text);
    end loop;
    return next n::text;
  end loop;
end $$;

-- The n-th successor, so a whole batch can be numbered in one set-based UPDATE
-- instead of a round trip per row.
create or replace function fn_account_no_nth(p_from int, p_n int) returns int
language plpgsql immutable as $$
declare n int := p_from; i int;
begin
  for i in 1 .. p_n loop n := fn_account_no_next(n); end loop;
  return n;
end $$;

comment on function fn_account_no_nth(int, int) is
  'DECISIONS §12: the n-th account number after p_from in the zero-free 5-digit sequence.';

comment on function fn_next_account_nos(uuid, int) is
  'DECISIONS §12: allocate the next N unused 5-digit zero-free account numbers for a tenant.';

create or replace function fn_next_account_no(p_tenant uuid) returns text
language sql as $$ select fn_next_account_nos(p_tenant, 1) $$;

comment on function fn_next_account_no(uuid) is
  'DECISIONS §12: the next unused 5-digit account number for a tenant.';

-- ── 3. the account number is decided at VALIDATION, not at commit ────────────
-- Art. VII §5 makes the dry-run report the approval gate, so the report has to
-- state the account number each row will actually receive. Deciding it at commit
-- time meant the owner approved a report that did not contain the one identifier
-- the decision was about. The commit now copies this column instead of minting.
alter table staging_customers
  add column if not exists assigned_code text;

comment on column staging_customers.assigned_code is
  'The account number this row will receive on commit — decided and shown at validation (DECISIONS §12, Art. VII §5).';

-- A batch may not propose the same account number twice. This is a structural
-- guard, not a check the application is trusted to perform.
create unique index if not exists staging_customers_batch_assigned_code_uq
  on staging_customers (batch_id, assigned_code)
  where assigned_code is not null;

-- ── 4. one allocator for the whole batch, called by BOTH importers ───────────
-- DECISIONS §12 ¶3 named three call sites that each carried their own copy of the
-- minting rule and had already drifted apart. The rule now lives here only: the
-- console importer and the CLI importer both call this function, and
-- lib/domain/customers.ts calls fn_next_account_no for a single new customer.
--
-- A clean row whose source id is already a valid 5-digit zero-free number KEEPS
-- it — that is the master file's whole purpose. Every other clean row is minted a
-- fresh number strictly above every number in play (live codes and the numbers
-- this batch just adopted), so a minted number can collide with neither.
create or replace function fn_assign_batch_account_numbers(p_tenant uuid, p_batch uuid)
returns int language plpgsql as $$
declare assigned int;
begin
  update staging_customers
     set assigned_code = source_row_id
   where batch_id = p_batch and disposition = 'clean'
     and assigned_code is null and source_row_id ~ '^[1-9]{5}$';

  with start as (
    select greatest(
             11827,
             coalesce((select max(code::int) from customers
                        where tenant_id = p_tenant and code ~ '^[1-9]{5}$'), 0),
             coalesce((select max(assigned_code::int) from staging_customers
                        where batch_id = p_batch and assigned_code ~ '^[1-9]{5}$'), 0)
           ) as n
  ), need as (
    select id, row_number() over (order by source_row_id) as rn
      from staging_customers
     where batch_id = p_batch and disposition = 'clean' and assigned_code is null
  )
  update staging_customers s
     set assigned_code = fn_account_no_nth(start.n, need.rn::int)::text,
         reason = 'account number minted — the file did not supply a valid 5-digit one'
    from need, start
   where s.id = need.id;

  select count(*)::int into assigned
    from staging_customers where batch_id = p_batch and assigned_code is not null;
  return assigned;
end $$;

comment on function fn_assign_batch_account_numbers(uuid, uuid) is
  'DECISIONS §12: assign every clean staging row the account number it will receive on commit. The single minting rule for both importers.';
