-- =============================================================================
-- 007_institution_soft_delete.sql — stop deleting an institution from destroying
-- the link to its students.
--
-- WHAT WAS WRONG. DELETE /api/institutions/:id ran:
--
--     delete from public.institutions where id = $1
--
-- and profiles.institution_id is `on delete set null` (001_init.sql:94). So the
-- database dutifully nulled every student's institution_id, and the institution
-- row — the only thing that knew those students belonged together — was gone.
--
-- The old code called this "students survive: nothing is silently destroyed",
-- and the rows do survive. But the RELATIONSHIP does not, and it is
-- unrecoverable: nothing on a profile records which institution it was in.
-- (profiles.college is free text — on this database it holds "" and
-- "Engineering", which name no institution at all.) Re-adding the same college
-- mints a fresh uuid and its students stay orphaned forever, invisible on their
-- own leaderboard and counted toward nobody.
--
-- That is exactly what happened here: 3 of 3 students were orphaned, with the
-- college re-created and unable to reclaim them.
--
-- THE FIX. Delete becomes an archive:
--
--     update public.institutions set deleted_at = now() where id = $1
--
-- The row stays, so the FK never fires, so institution_id is never nulled.
-- Students are not touched at all — there is nothing to "re-map" later, because
-- nothing was ever unmapped. Re-adding a college whose code matches an archived
-- row restores THAT row (same uuid), and its students are simply there again.
--
-- Restoring beats remapping: a remap has to guess which students belonged where,
-- and this schema gives it nothing to guess with.
-- =============================================================================

alter table public.institutions
  add column if not exists deleted_at timestamptz;

comment on column public.institutions.deleted_at is
  'Archived-at. NULL means live. Set instead of DELETE so profiles.institution_id (on delete set null) never fires and students keep their link. Every read must filter `deleted_at is null` — an archived institution must not appear in lists, counts, or as a destination for new students.';

-- The list query filters on this on every page load.
create index if not exists institutions_live_idx
  on public.institutions (deleted_at)
  where deleted_at is null;

-- ── The code is now the identity, so it has to exist ────────────────────────
--
-- Restore-on-re-add matches an archived row by `code`. A code of '' can't match
-- anything, so an institution created without one could never be restored — the
-- feature would silently not work for it, which is worse than refusing up front.
-- The API validates this too; the constraint is here so it holds regardless of
-- which code path writes.
--
-- Backfill first: any existing row with no code gets a slug of its name, so the
-- constraint can be added without failing on live data. Uppercased and stripped
-- to word characters, truncated to 12, with a uuid suffix if that collides.
update public.institutions
   set code = left(
         regexp_replace(upper(coalesce(nullif(trim(name), ''), 'INST')), '[^A-Z0-9]', '', 'g'),
         12
       )
 where coalesce(trim(code), '') = '';

-- If the backfill produced duplicates (two colleges whose names slug the same),
-- break the tie with a short uuid fragment rather than failing the migration.
update public.institutions i
   set code = left(i.code, 8) || '-' || left(i.id::text, 4)
 where exists (
         select 1 from public.institutions j
          where j.id <> i.id and lower(j.code) = lower(i.code)
       );

alter table public.institutions
  drop constraint if exists institutions_code_present;
alter table public.institutions
  add constraint institutions_code_present check (length(trim(code)) > 0);

-- ── Uniqueness must span ARCHIVED rows too ──────────────────────────────────
--
-- This is the load-bearing detail. If the unique index only covered live rows,
-- re-adding an archived code would insert a SECOND row with that code, and the
-- restore lookup would then be ambiguous — which is the bug all over again, just
-- later. Covering every row means an archived code is reserved, and the API
-- intercepts the collision and restores instead of inserting.
--
-- 001_init.sql's index was `where code <> ''`; codes are now always non-empty,
-- so the predicate is dropped and this is a plain unique index over all rows.
drop index if exists public.institutions_code_key;
create unique index if not exists institutions_code_key
  on public.institutions (lower(code));
