-- Runs the two reminder jobs once a day.
--
-- send-push-reminders and send-email-reminders were deployed but nothing
-- ever called them, so the reminder switches in Settings ▸ Notifications did
-- nothing. Each job refuses any request without the right x-cron-secret; the
-- secret lives in Supabase Vault as `reminders_cron_secret` (created
-- separately, never committed) and is read at call time, so it is not in
-- this file or in cron.job.
--
-- 13:00 UTC: afternoon in Europe, morning in the Americas, evening in India.
-- Both jobs dedupe to one reminder per user per kind per day, so the time
-- only decides when it lands, not how many arrive.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-running this migration replaces the jobs rather than duplicating them.
select cron.unschedule(jobname)
from cron.job
where jobname in ('send-push-reminders-daily', 'send-email-reminders-daily');

select cron.schedule(
  'send-push-reminders-daily',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://mlvgqwqiynpwpwzqufdf.supabase.co/functions/v1/send-push-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'reminders_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

select cron.schedule(
  'send-email-reminders-daily',
  '5 13 * * *',
  $$
  select net.http_post(
    url := 'https://mlvgqwqiynpwpwzqufdf.supabase.co/functions/v1/send-email-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'reminders_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
