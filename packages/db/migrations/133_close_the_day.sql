-- 133_close_the_day.sql
-- Closing the day, as the owner asked for it: the equipment and the chemicals
-- are CHECKED BACK IN, the day is summarised, and only then does the supervisor
-- put their name to it and sign out.
--
-- 127 gave postflight_checks a `stock_returned` jsonb blob. A blob is fine for
-- ticks; it is the wrong shape for quantities, because the whole point of the
-- closing count is that it can be RECONCILED against the morning count and the
-- day's recorded use — and you cannot join a report to a jsonb bag of item ids.
-- So the closing count gets a real table, mirroring the morning one.

create table if not exists postflight_stock_declarations (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id),
  postflight_check_id   uuid not null references postflight_checks(id) on delete cascade,
  item_id               uuid not null references items(id),
  returned_qty_base     numeric(14,3) not null check (returned_qty_base >= 0),
  note                  text,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  unique (postflight_check_id, item_id)
);
create index if not exists postflight_stock_decl_item_idx
  on postflight_stock_declarations (tenant_id, item_id);

comment on table postflight_stock_declarations is
  'What the team lead COUNTED back onto the van at the end of the day, per product. Reconciled against the morning declaration and the day''s recorded use by technician_day_stock_reconciliation.';

alter table postflight_stock_declarations enable row level security;
drop policy if exists tenant_isolation on postflight_stock_declarations;
create policy tenant_isolation on postflight_stock_declarations
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
-- Same grants as the morning declaration: correctable until the day is confirmed,
-- and the confirmation itself is what freezes the figures (postflight_authority).
grant select, insert, update, delete on postflight_stock_declarations to mop_app;

-- ── Does the chemical add up? ──────────────────────────────────────────
-- opening count − what was recorded as used = what SHOULD be left.
-- Against what was actually counted back. The gap is the number worth reading:
-- a persistent negative is chemical leaving the van without a job attached.
create or replace view technician_day_stock_reconciliation as
  select coalesce(pre.tenant_id, post.tenant_id)         as tenant_id,
         coalesce(pre.technician_id, post.technician_id) as technician_id,
         coalesce(pre.check_date, post.check_date)       as check_date,
         i.id   as item_id,
         i.name as product,
         u.code as unit,
         coalesce(pre.qty, 0)      as opened_with,
         coalesce(used.qty, 0)     as recorded_used,
         coalesce(pre.qty, 0) - coalesce(used.qty, 0) as should_have_left,
         post.qty                  as counted_back,
         case when post.qty is not null
              then post.qty - (coalesce(pre.qty, 0) - coalesce(used.qty, 0)) end as unexplained
    from (
      select pc.tenant_id, pc.technician_id, pc.check_date, d.item_id, sum(d.declared_qty_base) as qty
        from preflight_stock_declarations d
        join preflight_checks pc on pc.id = d.preflight_check_id
       group by pc.tenant_id, pc.technician_id, pc.check_date, d.item_id
    ) pre
    full outer join (
      select pc.tenant_id, pc.technician_id, pc.check_date, d.item_id, sum(d.returned_qty_base) as qty
        from postflight_stock_declarations d
        join postflight_checks pc on pc.id = d.postflight_check_id
       group by pc.tenant_id, pc.technician_id, pc.check_date, d.item_id
    ) post
      on  post.tenant_id = pre.tenant_id and post.technician_id = pre.technician_id
      and post.check_date = pre.check_date and post.item_id = pre.item_id
    left join (
      select m.tenant_id, ja.technician_id, m.created_at::date as check_date,
             m.item_id, sum(m.actual_qty) as qty
        from job_material_usage m
        join job_assignments ja on ja.job_id = m.job_id
       group by m.tenant_id, ja.technician_id, m.created_at::date, m.item_id
    ) used
      on  used.tenant_id  = coalesce(pre.tenant_id, post.tenant_id)
      and used.technician_id = coalesce(pre.technician_id, post.technician_id)
      and used.check_date = coalesce(pre.check_date, post.check_date)
      and used.item_id    = coalesce(pre.item_id, post.item_id)
    join items i on i.id = coalesce(pre.item_id, post.item_id)
    left join units u on u.id = i.base_unit_id;

comment on view technician_day_stock_reconciliation is
  'Per technician per day per product: opened with, recorded used, should have left, counted back, and the unexplained difference. Null counted_back means the day was not closed with a count.';

grant select on technician_day_stock_reconciliation to mop_app;

-- The wording that was confirmed is already stored with the confirmation (127).
-- The statement changes here because the day now covers equipment and a counted
-- chemical return, and a signature must name what it actually covered.
