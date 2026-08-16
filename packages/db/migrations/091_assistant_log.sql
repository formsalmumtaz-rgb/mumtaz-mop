-- 091_assistant_log.sql
-- Item 5: Claude-in-MOP assistant (admin only, explain-only). Every question
-- and answer is logged; the assistant NEVER writes to the database.
create table if not exists assistant_log (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  user_id     uuid,
  kind        text not null default 'ask' check (kind in ('ask','draft_quotation')),
  question    text not null,
  answer      text,
  model       text,
  input_tokens  int,
  output_tokens int,
  created_at  timestamptz not null default now()
);
alter table assistant_log enable row level security;
drop policy if exists tenant_isolation on assistant_log;
create policy tenant_isolation on assistant_log
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert on assistant_log to mop_app;
