-- 016_rank_tiers.sql
--
-- Admin-configurable rank tiers. An institution admin sets a minimum score,
-- per platform, that a student must reach to be awarded a tier. "starter" is
-- the implicit floor every student has from day one and is never stored here
-- (there is nothing to configure: it requires 0 on every platform).
--
-- A tier is earned by meeting EVERY platform threshold the admin has actually
-- configured for it (min_score > 0). A tier with no configured platforms is
-- simply not attainable yet, rather than trivially true for everyone.
create table if not exists public.rank_tier_thresholds (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  rank_key text not null check (rank_key in ('contender', 'climber', 'challenger', 'master', 'grandmaster')),
  platform text not null check (platform in ('leetcode', 'codeforces', 'atcoder', 'github', 'hackerrank', 'hackerearth')),
  min_score integer not null default 0 check (min_score >= 0),
  updated_at timestamptz not null default now(),
  unique (institution_id, rank_key, platform)
);

create index if not exists rank_tier_thresholds_institution_idx
  on public.rank_tier_thresholds (institution_id);

-- RLS on + zero policies = nothing readable by anon or authenticated; the
-- Express API (service_role) bypasses RLS and is the sole way in. Same
-- pattern as institutions/profiles/platform_stats in 001_init.sql.
alter table public.rank_tier_thresholds enable row level security;
revoke all on public.rank_tier_thresholds from anon, authenticated;
