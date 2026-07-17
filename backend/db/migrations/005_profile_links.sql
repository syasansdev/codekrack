-- =============================================================================
-- 005_profile_links.sql — somewhere for the non-scraped links to live.
--
-- THE GAP: Firestore's platformUrls was a free-form map, and AdminUserCreation
-- writes SEVEN keys into it:
--     github, leetcode, codeforces, atcoder, hackerrank, linkedin, resume
-- Only the first four are scraped. platform_stats is keyed by platform_kind,
-- which (correctly) has just those four — so hackerrank, linkedin and resume had
-- nowhere to go and would have been silently dropped on every save. Silent data
-- loss is the worst kind, so this closes it before any real data exists.
--
-- WHY NOT ADD THEM TO THE ENUM: platform_stats rows carry status, metric,
-- rating and rank. None of that means anything for a Google Drive link to a CV.
-- They would be four permanently-'pending' rows per student, forever waiting for
-- a scraper that will never run.
--
-- So: scraped platforms -> platform_stats (typed, indexed, has a scrape state).
--     Everything else    -> profiles.links (a plain map of label -> URL).
--
-- The API stitches both back together into the single `platformUrls` object the
-- components already render, so this split is invisible to the frontend.
-- =============================================================================

alter table public.profiles
  add column if not exists links jsonb not null default '{}'::jsonb;

comment on column public.profiles.links is
  'Non-scraped profile URLs (resume, linkedin, hackerrank). Scraped platforms live in platform_stats. The API merges both into platformUrls on the wire.';

-- Reject anything that isn't a flat object, so a bad write can't turn this into
-- an array or a scalar and break every consumer that expects a map.
alter table public.profiles
  drop constraint if exists profiles_links_is_object;
alter table public.profiles
  add constraint profiles_links_is_object check (jsonb_typeof(links) = 'object');
