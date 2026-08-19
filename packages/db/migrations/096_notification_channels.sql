-- 096_notification_channels.sql
-- Make the notification engine CHANNEL-PLURAL before a second channel exists.
-- Email is hardcoded today only in the sense that it is the one channel
-- implemented; the row now says which channel carried it, so adding WhatsApp
-- later is a dispatcher branch, not a schema migration under pressure.
alter table outbound_notifications
  add column if not exists channel text not null default 'email',
  add column if not exists channel_ref text;          -- provider-side id per channel

do $$
begin
  begin
    alter table outbound_notifications add constraint outbound_notifications_channel_check
      check (channel in ('email','whatsapp','sms'));
  exception when duplicate_object then null; end;
end $$;

comment on column outbound_notifications.channel is
  'Delivery channel. WhatsApp, when adopted, MUST go through the official WhatsApp Business API (Meta direct or Twilio). Unofficial WhatsApp Web automation is forbidden: it breaches WhatsApp terms and risks the business number being banned.';

-- Per-customer channel preference, so the choice is data rather than code.
alter table customers
  add column if not exists preferred_channel text;
do $$
begin
  begin
    alter table customers add constraint customers_preferred_channel_check
      check (preferred_channel is null or preferred_channel in ('email','whatsapp','sms'));
  exception when duplicate_object then null; end;
end $$;
