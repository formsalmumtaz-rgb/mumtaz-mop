-- 128_technician_edit_permission.sql
-- PILOT DEFECT 1 — the console crash that blocked everything.
--
-- I wrote three call sites this session guarded by requirePermission
-- ("technician.edit"):
--     app/teams/crews/actions.ts   — dragging a technician onto a crew
--     app/hr/actions.ts            — approving a leave request
--     app/hr/page.tsx              — viewing the people queue
-- and NEVER GRANTED THE PERMISSION TO ANY ROLE. Not even admin had it.
--
-- Why it was invisible to me and immediate for the owner: I tested with
-- AUTH_REQUIRED=false, where the permission gate no-ops. The pilot runs with auth
-- ENFORCED, where the same gate throws — and the crash landed on exactly the
-- screen my own pilot instructions send the owner to first ("Console → Crews →
-- drag the two technicians onto a team"). A feature that only works with the
-- guard switched off is not built.
--
-- Granted to the three roles that already hold job.edit — the people who run
-- operations. Deliberately NOT to finance or viewer: staffing is not their job.
-- The code must exist in the catalogue first: role_permissions.permission_code is
-- a foreign key to permissions(code). That FK is why an invented code fails loudly
-- at the database — my mistake was never inserting it, in either place.
insert into permissions (code, description)
values ('technician.edit', 'Manage staff: crews, vehicles, and leave/HR requests')
on conflict (code) do nothing;

insert into role_permissions (tenant_id, role_id, permission_code)
select r.tenant_id, r.id, 'technician.edit'
  from roles r
 where r.code in ('admin', 'management', 'operations')
   and not exists (select 1 from role_permissions rp
                    where rp.role_id = r.id and rp.permission_code = 'technician.edit');
