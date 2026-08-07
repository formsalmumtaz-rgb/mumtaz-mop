-- 040_rls_policy_gaps.sql
-- Close RLS policy gaps found before the A3 role flip.
--
-- (A) Six child/grandchild tables have RLS ENABLED (from the 009 blanket enable)
--     but NO policy, because they carry no tenant_id — so under mop_app they are
--     deny-all (a functional break once we flip off the superuser role). They are
--     scoped through their tenant-owning parent here. (Not introduced recently;
--     they pre-date the finance work.)
-- (B) `permissions` (mig 039) is a global, non-tenant catalogue that had RLS off.
--     Enable RLS with a read-all policy so it is explicitly readable, clearing the
--     advisor without inventing tenant semantics for a shared catalogue.
--
-- RLS is already enabled on the six tables; we only add policies. mop_app already
-- holds DML grants (009). Additive; no data change.

-- treatment_recipe_versions → treatment_recipes(recipe_id)
create policy tenant_isolation on treatment_recipe_versions
  using (exists (select 1 from treatment_recipes r where r.id = recipe_id and r.tenant_id = app_current_tenant()))
  with check (exists (select 1 from treatment_recipes r where r.id = recipe_id and r.tenant_id = app_current_tenant()));

-- checklist_template_versions → checklist_templates(template_id)
create policy tenant_isolation on checklist_template_versions
  using (exists (select 1 from checklist_templates t where t.id = template_id and t.tenant_id = app_current_tenant()))
  with check (exists (select 1 from checklist_templates t where t.id = template_id and t.tenant_id = app_current_tenant()));

-- checklist_template_items → checklist_template_versions → checklist_templates
create policy tenant_isolation on checklist_template_items
  using (exists (select 1 from checklist_template_versions v join checklist_templates t on t.id = v.template_id
                  where v.id = template_version_id and t.tenant_id = app_current_tenant()))
  with check (exists (select 1 from checklist_template_versions v join checklist_templates t on t.id = v.template_id
                  where v.id = template_version_id and t.tenant_id = app_current_tenant()));

-- document_template_versions → document_templates(template_id)
create policy tenant_isolation on document_template_versions
  using (exists (select 1 from document_templates t where t.id = template_id and t.tenant_id = app_current_tenant()))
  with check (exists (select 1 from document_templates t where t.id = template_id and t.tenant_id = app_current_tenant()));

-- price_list_versions → price_lists(price_list_id)
create policy tenant_isolation on price_list_versions
  using (exists (select 1 from price_lists pl where pl.id = price_list_id and pl.tenant_id = app_current_tenant()))
  with check (exists (select 1 from price_lists pl where pl.id = price_list_id and pl.tenant_id = app_current_tenant()));

-- price_list_lines → price_list_versions → price_lists
create policy tenant_isolation on price_list_lines
  using (exists (select 1 from price_list_versions v join price_lists pl on pl.id = v.price_list_id
                  where v.id = price_list_version_id and pl.tenant_id = app_current_tenant()))
  with check (exists (select 1 from price_list_versions v join price_lists pl on pl.id = v.price_list_id
                  where v.id = price_list_version_id and pl.tenant_id = app_current_tenant()));

-- (B) permissions: global catalogue — RLS on, readable by all roles.
alter table permissions enable row level security;
create policy read_all on permissions for select using (true);
