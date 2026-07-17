-- =============================================================================
-- 001_init.sql — CodeKrack initial schema (Firestore -> Postgres)
--
-- Design notes (deliberate departures from the Firestore model):
--
--  1. NO is_admin / is_super_admin source columns. Firestore stored `role`,
--     `isAdmin` AND `isSuperAdmin` separately — three fields that could drift
--     out of sync and disagree about who is privileged. Here `role` is the only
--     truth; the two booleans are GENERATED from it and cannot lie.
--
--  2. NO institutions.admin_uid / admin_email. Firestore stored the admin's uid
--     on the institution AND institution_id on the admin's profile — a cycle
--     that needs both sides updated together. Here the admin is derived:
--         select * from profiles where institution_id = $1 and role = 'admin'
--     This also allows more than one admin per institution later, for free.
--
--  3. platform_urls (jsonb map) + platformData (jsonb map) + scrapingStatus
--     (jsonb map) collapse into ONE platform_stats row per (student, platform),
--     holding the URL, the scrape state and the numbers together. The columns
--     the leaderboard sorts on are real typed columns (indexable); the rest of
--     each platform's payload lives in `data` jsonb.
--
--  4. total_solved is a VIEW, not a stored column, so it can never disagree
--     with the platform_stats rows it sums.
--
-- RLS: every table is RLS-enabled with NO policies = deny-all for anon and
-- authenticated. The backend's service_role key bypasses RLS by design, so
-- institution scoping is enforced in backend code, NOT here. This is
-- defence-in-depth: if the public anon key leaks, it reaches nothing.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---- enums ------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('student', 'admin', 'superadmin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.platform_kind as enum ('leetcode', 'github', 'codeforces', 'atcoder');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.scrape_state as enum ('pending', 'success', 'failed');
exception when duplicate_object then null; end $$;


-- ---- updated_at trigger -----------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ---- institutions -----------------------------------------------------------
create table if not exists public.institutions (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null check (length(trim(name)) > 0),
  code          text        not null default '',
  address       text        not null default '',
  contact_email text        not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid        -- FK added after profiles exists (circular)
);

-- Codes are optional, but must be unique when present, case-insensitively.
create unique index if not exists institutions_code_key
  on public.institutions (lower(code))
  where code <> '';

drop trigger if exists institutions_touch on public.institutions;
create trigger institutions_touch before update on public.institutions
  for each row execute function public.touch_updated_at();


-- ---- profiles ---------------------------------------------------------------
-- One row per auth.users row. Deleting the auth user cascades to the profile,
-- so a login can never outlive its profile.
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,

  email          text        not null,
  name           text        not null default '',
  display_name   text        not null default '',

  -- Trust boundary. Set by the server only, never from a request body.
  role           public.user_role not null default 'student',
  institution_id uuid references public.institutions(id) on delete set null,

  -- Derived from role — cannot drift, cannot be set directly.
  is_admin       boolean generated always as (role in ('admin', 'superadmin')) stored,
  is_super_admin boolean generated always as (role = 'superadmin') stored,

  -- Student detail
  phone_number      text not null default '',
  register_number   text not null default '',
  roll_number       text not null default '',
  department        text not null default '',
  year              text not null default '',   -- text: imports contain "1", "1st year", "2024"
  college           text not null default '',
  tenth_percentage  numeric(5,2),
  twelfth_percentage numeric(5,2),

  streak            integer not null default 0,
  last_activity_date date,

  -- ⚠️ SECURITY DEBT, carried over from Firestore as-is: this is the student's
  -- temporary password in PLAINTEXT, readable by any admin via /admin/passwords.
  -- Faithful to current behaviour so the migration changes one thing at a time.
  -- Fix later: store a one-time reveal token, or drop it and use a reset link.
  temp_password              text,
  temp_password_created_at   timestamptz,
  requires_password_reset    boolean not null default false,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_login_at timestamptz,
  created_by   uuid references public.profiles(id) on delete set null,

  -- A super-admin is global and must not be pinned to an institution.
  -- This is the DB-level twin of useAdminScope's fail-closed rule.
  constraint superadmin_has_no_institution
    check (role <> 'superadmin' or institution_id is null)
);

create unique index if not exists profiles_email_key on public.profiles (lower(email));
-- The query every scoped list runs: "students of institution X".
create index if not exists profiles_institution_role_idx
  on public.profiles (institution_id, role);
create index if not exists profiles_role_idx on public.profiles (role);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Now that profiles exists, close the institutions.created_by FK.
do $$ begin
  alter table public.institutions
    add constraint institutions_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;


-- ---- platform_stats ---------------------------------------------------------
-- One row per (student, platform). Holds the profile URL, the scrape state and
-- the numbers together, so "has a URL but never scraped" is just status='pending'.
create table if not exists public.platform_stats (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  platform    public.platform_kind not null,

  username    text not null default '',
  profile_url text not null default '',
  status      public.scrape_state not null default 'pending',

  -- Typed + indexable because the leaderboard sorts on them.
  problems_solved integer not null default 0,
  rating          integer not null default 0,
  max_rating      integer not null default 0,
  rank            text    not null default '',

  -- Everything platform-specific: leetcode easy/medium/hard + acceptanceRate,
  -- github stars/forks/followers, codeforces contribution/maxRank, etc.
  data jsonb not null default '{}'::jsonb,

  -- On failure we keep the last good numbers and record why (never fabricate).
  error           text,
  last_updated    timestamptz,   -- last SUCCESSFUL scrape
  last_attempt_at timestamptz,   -- last attempt, success or not

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, platform)
);

create index if not exists platform_stats_user_idx on public.platform_stats (user_id);
create index if not exists platform_stats_leaderboard_idx
  on public.platform_stats (platform, problems_solved desc);
create index if not exists platform_stats_status_idx on public.platform_stats (status);

drop trigger if exists platform_stats_touch on public.platform_stats;
create trigger platform_stats_touch before update on public.platform_stats
  for each row execute function public.touch_updated_at();


-- ---- derived totals ---------------------------------------------------------
-- A view, not a column: it sums the same rows the leaderboard reads, so the
-- total can never disagree with the per-platform numbers behind it.
-- Only successful scrapes count — a failed platform must not zero someone out.
create or replace view public.student_totals
with (security_invoker = true) as
select
  p.id as user_id,
  coalesce(sum(ps.problems_solved) filter (where ps.status = 'success'), 0)::int as total_solved,
  max(ps.last_updated) as last_scraped_at
from public.profiles p
left join public.platform_stats ps on ps.user_id = p.id
where p.role = 'student'
group by p.id;


-- ---- lockdown ---------------------------------------------------------------
-- RLS on + zero policies = nothing is readable by anon or authenticated.
-- service_role (backend only) bypasses RLS and is the sole way in.
alter table public.institutions   enable row level security;
alter table public.profiles       enable row level security;
alter table public.platform_stats enable row level security;

-- Belt and braces: drop the default grants PostgREST relies on, so even a
-- future accidental policy can't expose these to the public anon key.
revoke all on public.institutions   from anon, authenticated;
revoke all on public.profiles       from anon, authenticated;
revoke all on public.platform_stats from anon, authenticated;
revoke all on public.student_totals from anon, authenticated;

comment on table public.profiles is
  'App data for each auth.users row. role is the only privilege truth; is_admin/is_super_admin are generated from it.';
comment on column public.profiles.temp_password is
  'SECURITY DEBT: plaintext temp password, carried over from Firestore. Replace with a reset link.';
comment on table public.platform_stats is
  'One row per (student, platform): URL + scrape state + numbers. Failed scrapes keep the last good values.';
