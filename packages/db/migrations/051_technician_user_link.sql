-- 051_technician_user_link.sql
-- Links a technician to their login (app_users.id = auth.users.id) so the field
-- API can scope a request to the authenticated technician's OWN assigned jobs.
--
-- Prerequisite for closing the /api/field/* hole: those routes were unauthenticated
-- and returned/accepted work for the whole tenant. Per-technician scoping needs a
-- user -> technician link, which did not exist. Nullable, because existing
-- technicians have no login yet and office staff have no technician row; the field
-- routes fail closed (expose nothing) for any user without a linked technician.

alter table technicians
  add column if not exists user_id uuid references app_users(id);

-- One login operates as at most one technician: an ambiguous mapping would
-- silently broaden a user's job access. Enforced, not assumed.
create unique index if not exists technicians_user_id_key
  on technicians(user_id) where user_id is not null;

comment on column technicians.user_id is
  'The app_user (login) this technician operates as. Scopes field-app sync/upload/media to their own assigned jobs. Null until a login is provisioned.';
