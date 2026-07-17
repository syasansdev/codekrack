-- =============================================================================
-- 004_notify_security_definer.sql — fixes a regression introduced by 003.
--
-- THE BUG: after 003, deleting a user through the Supabase Auth admin API
-- started failing with a 500 (AuthRetryableFetchError). Student deletion, which
-- passed its tests before 003, broke.
--
-- WHY: Supabase's Auth service (GoTrue) connects as the `supabase_auth_admin`
-- role. Deleting a row from auth.users cascades into public.profiles, which
-- fires profiles_delete_notify -> public.notify_change(). A plpgsql function is
-- SECURITY INVOKER by default, so notify_change() ran as supabase_auth_admin —
-- a role with no rights on the public schema. The function raised permission
-- denied, the cascade aborted, and GoTrue surfaced it as a 500.
--
-- The trigger was reachable by a role we never considered, because a foreign key
-- makes another system's writes run our code.
--
-- THE FIX: SECURITY DEFINER, so the trigger runs as its owner (postgres)
-- regardless of who tripped it.
--
-- SECURITY DEFINER is a real privilege escalation if written carelessly, so:
--   - `set search_path` is pinned. Without it, a caller could put a malicious
--     `profiles` table earlier in their own search_path and have this function
--     read it as postgres.
--   - The body does nothing but read one uuid and call pg_notify. It takes no
--     user input, builds no dynamic SQL, and writes nothing.
-- =============================================================================

create or replace function public.notify_change()
returns trigger
language plpgsql
security definer
-- Pinned so the function cannot be tricked into resolving `profiles` to
-- something a caller controls. pg_temp last is the standard hardening.
set search_path = public, pg_temp
as $$
declare
  rec      record;
  inst_id  uuid;
  topic    text := tg_argv[0];
begin
  rec := case when tg_op = 'DELETE' then old else new end;

  if tg_table_name = 'platform_stats' then
    -- During a cascade the parent profile may already be gone; then this simply
    -- finds nothing and inst_id stays null, which fans out to everyone. That is
    -- the safe direction: a needless refetch, never a missed one.
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

  return null;
end;
$$;

comment on function public.notify_change is
  'Fires pg_notify on the "codekrack" channel for SSE. SECURITY DEFINER: must run as owner because auth.users cascades reach it as supabase_auth_admin (see 004). Payload is a signal (topic + institution), never row data.';

-- Belt and braces: the cascade path also needs to be able to see the function
-- at all. Explicit grants beat relying on PUBLIC defaults staying put.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.notify_change() to supabase_auth_admin;
