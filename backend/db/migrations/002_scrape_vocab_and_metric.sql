-- =============================================================================
-- 002_scrape_vocab_and_metric.sql
--
-- Two corrections to 001, found by reading what the app actually does rather
-- than what the Firestore field names implied.
--
-- 1. SCRAPE STATUS VOCABULARY. 001 guessed 'success'. The real vocabulary the
--    app reads and writes is pending | in_progress | completed | failed:
--      - scrapers.js formatScrapedData() writes 'completed' / 'failed'
--      - studentRoutes.js seeds 'pending'
--      - ScrapingStatus.jsx drives its UI off 'in_progress'
--      - Leaderboard.jsx:136 counts a score ONLY when status === 'completed'
--    'success' appears nowhere. Matching the app exactly.
--
-- 2. problems_solved -> metric. 001 assumed every platform reports solved
--    problems. It does not — both leaderboards sort each platform by its OWN
--    headline number:
--      leetcode   -> totalSolved
--      github     -> repositories   <-- not problems at all
--      codeforces -> problemsSolved
--      atcoder    -> problemsSolved
--    Calling GitHub's repo count "problems_solved" would be a lie in the
--    column name, and would silently inflate any total that summed it.
--
-- Consequently student_totals now sums only the problem-solving platforms and
-- excludes GitHub. That total is also a genuine bug fix: Firestore's
-- profile-level `totalSolved` was written as 0 at creation and never updated by
-- anything, so getDashboardStats' "total problems solved" always reported 0.
-- =============================================================================

-- student_totals reads both columns we are about to change, and Postgres will
-- not alter a column a view depends on. Drop it now, rebuild it in step 3.
drop view if exists public.student_totals;


-- ---- 1. status vocabulary ---------------------------------------------------
-- Swap the type rather than ALTER TYPE ADD VALUE, so the whole change stays
-- inside one transaction and 'success' is actually removed, not just orphaned.
create type public.scrape_state_new as enum ('pending', 'in_progress', 'completed', 'failed');

alter table public.platform_stats
  alter column status drop default;

alter table public.platform_stats
  alter column status type public.scrape_state_new
  using (case status::text when 'success' then 'completed' else status::text end)::public.scrape_state_new;

alter table public.platform_stats
  alter column status set default 'pending';

drop type public.scrape_state;
alter type public.scrape_state_new rename to scrape_state;


-- ---- 2. problems_solved -> metric -------------------------------------------
alter table public.platform_stats rename column problems_solved to metric;

comment on column public.platform_stats.metric is
  'The platform''s headline leaderboard number. leetcode=totalSolved, github=repositories, codeforces/atcoder=problemsSolved. Units differ per platform — only compare within a platform.';


-- ---- 3. rebuild dependents --------------------------------------------------
drop index if exists platform_stats_leaderboard_idx;
create index platform_stats_leaderboard_idx
  on public.platform_stats (platform, metric desc);

-- Only 'completed' counts — mirrors Leaderboard.jsx:136 exactly, so a pending
-- or failed scrape never contributes a stale or zero score.
-- GitHub is excluded: repositories are not solved problems.
create or replace view public.student_totals
with (security_invoker = true) as
select
  p.id as user_id,
  coalesce(sum(ps.metric) filter (
    where ps.status = 'completed'
      and ps.platform in ('leetcode', 'codeforces', 'atcoder')
  ), 0)::int as total_solved,
  max(ps.last_updated) filter (where ps.status = 'completed') as last_scraped_at
from public.profiles p
left join public.platform_stats ps on ps.user_id = p.id
where p.role = 'student'
group by p.id;

revoke all on public.student_totals from anon, authenticated;
