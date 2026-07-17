-- =============================================================================
-- 003_realtime_notify.sql — push notifications for SSE
--
-- Express cannot see writes it did not make, and the writer that matters most —
-- the GitHub Actions scraper — runs in a completely different process. So the
-- signal has to come from the database itself: an AFTER trigger fires pg_notify
-- on every relevant row change, no matter who made it. Express holds one
-- dedicated LISTEN connection and fans the signal out to SSE clients.
--
-- The payload carries a TOPIC and an INSTITUTION, never row data. Two reasons:
--   1. Security. Pushing rows down SSE would mean re-implementing institution
--      scoping in the notify path; a bug there leaks another college's data.
--      A signal makes the client refetch through the already-scoped API, so
--      SSE can never become a second, unguarded way to read.
--   2. NOTIFY payloads are capped at 8000 bytes. Rows would not reliably fit.
--
-- institution_id is resolved here rather than client-side so the SSE hub can
-- decide who to wake without querying anything itself.
-- =============================================================================

create or replace function public.notify_change()
returns trigger
language plpgsql
as $$
declare
  rec      record;
  inst_id  uuid;
  topic    text := tg_argv[0];
begin
  rec := case when tg_op = 'DELETE' then old else new end;

  -- Where does this row's institution live? platform_stats has no
  -- institution_id of its own; it hangs off the student's profile.
  if tg_table_name = 'platform_stats' then
    select p.institution_id into inst_id from public.profiles p where p.id = rec.user_id;
  elsif tg_table_name = 'profiles' then
    inst_id := rec.institution_id;
  elsif tg_table_name = 'institutions' then
    inst_id := rec.id;
  end if;

  perform pg_notify(
    'codekrack',
    json_build_object(
      'topic',         topic,
      'institutionId', inst_id,
      'op',            tg_op
    )::text
  );

  return null; -- AFTER trigger; return value is ignored
end;
$$;

comment on function public.notify_change is
  'Fires pg_notify on the "codekrack" channel for SSE. Payload is a signal (topic + institution), never row data — clients refetch through the scoped API.';


-- ---- platform_stats -> scraping status + leaderboards -----------------------
-- The scraper's writes land here, so this is the trigger that makes both
-- realtime screens actually live.
drop trigger if exists platform_stats_notify on public.platform_stats;
create trigger platform_stats_notify
  after insert or update or delete on public.platform_stats
  for each row execute function public.notify_change('platform_stats');

-- ---- profiles -> student lists ----------------------------------------------
-- Only student rows: an admin updating their own last_login_at should not wake
-- every open leaderboard.
--
-- INSERT and DELETE need separate triggers rather than one combined trigger:
-- a DELETE trigger's WHEN clause cannot reference NEW (there is no new row),
-- and an INSERT's cannot reference OLD.
drop trigger if exists profiles_insert_notify on public.profiles;
create trigger profiles_insert_notify
  after insert on public.profiles
  for each row when (new.role = 'student')
  execute function public.notify_change('profiles');

drop trigger if exists profiles_delete_notify on public.profiles;
create trigger profiles_delete_notify
  after delete on public.profiles
  for each row when (old.role = 'student')
  execute function public.notify_change('profiles');

-- UPDATE is separate so it can ignore no-op churn. Without this filter, the
-- scraper stamping last_login_at or updated_at would fire a notify per student
-- per run and flood every connected client.
drop trigger if exists profiles_update_notify on public.profiles;
create trigger profiles_update_notify
  after update on public.profiles
  for each row when (
    old.role is distinct from new.role
    or old.institution_id is distinct from new.institution_id
    or old.name is distinct from new.name
    or old.email is distinct from new.email
    or old.roll_number is distinct from new.roll_number
    or old.department is distinct from new.department
  )
  execute function public.notify_change('profiles');

-- ---- institutions -----------------------------------------------------------
drop trigger if exists institutions_notify on public.institutions;
create trigger institutions_notify
  after insert or update or delete on public.institutions
  for each row execute function public.notify_change('institutions');
