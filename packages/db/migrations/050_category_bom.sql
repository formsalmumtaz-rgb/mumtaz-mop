-- 050_category_bom.sql
-- Category → Material/Consumable BOM (§3). A service category defines its
-- STANDARD/ESTIMATED materials — which chemical/consumable/equipment items and
-- how much per job (in the item's base unit, so partial units like 0.25 of a gel
-- tube are just decimals). Fully configurable per division/service/category from
-- admin — no chemical name or quantity is hardcoded, and one division's BOM never
-- affects another (rows are scoped to a category, which belongs to one service
-- line). This is the ESTIMATED side; ACTUAL consumption stays with the service
-- report + append-only stock_movements (FEFO), untouched.

create table service_category_items (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id),
  service_category_id  uuid not null references service_categories(id) on delete cascade,
  item_id              uuid not null references items(id),
  quantity             numeric not null check (quantity > 0),  -- per job, in the item's base unit (supports partial units)
  notes                text,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(), created_by uuid,
  updated_at           timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, service_category_id, item_id)
);
create index service_category_items_cat_idx on service_category_items (service_category_id);
create trigger service_category_items_touch before update on service_category_items for each row execute function set_updated_at();
alter table service_category_items enable row level security;
create policy tenant_isolation on service_category_items using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on service_category_items to mop_app;

-- Deterministic per-item standard cost (per base unit) = the most recent
-- purchase's unit cost (generated total_cost/total_base_quantity). 0 if never
-- purchased. STABLE, pure — no AI, no estimation heuristics.
create or replace function fn_item_standard_cost(p_tenant uuid, p_item uuid)
returns numeric language sql stable as $$
  select coalesce((
    select ip.unit_cost
      from item_purchases ip
     where ip.tenant_id = p_tenant and ip.item_id = p_item
     order by ip.created_at desc
     limit 1
  ), 0);
$$;

-- Estimated material cost for a category, from its active BOM lines.
create or replace function fn_category_material_cost(p_tenant uuid, p_category uuid)
returns numeric language sql stable as $$
  select coalesce(round(sum(sci.quantity * fn_item_standard_cost(p_tenant, sci.item_id)), 2), 0)
    from service_category_items sci
   where sci.tenant_id = p_tenant and sci.service_category_id = p_category and sci.is_active;
$$;
