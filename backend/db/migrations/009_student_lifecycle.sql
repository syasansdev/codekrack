-- =============================================================================
-- 009_student_lifecycle.sql — the two dates a student account lives by.
--
-- Both columns exist because students can now create their own accounts. Until
-- now every account was minted by an admin who could also remove it; a public
-- registration form means the set of accounts grows without anyone deciding it
-- should, so there has to be an answer to "when does this one stop mattering?"
-- and "how do I stop this one signing in without destroying its history?".
--
--   expires_at       when the 1-year retention clock runs out. Anchored to the
--                    account's creation date, NOT to the academic year — a
--                    student who registers in their 3rd year gets the same year
--                    as one who registers in their 1st.
--   deactivated_at   NULL means the account is live. Set means an admin has
--                    switched it off: the Supabase login is banned, so the
--                    account cannot sign in, but the profile, the platform rows
--                    and the scraped history all survive and come back intact
--                    if it is reactivated.
--
-- WHY expires_at IS STORED AND NOT COMPUTED. `created_at + interval '1 year'`
-- would be the same value, and would be impossible to change. Extending one
-- student (they are still enrolled, the college renewed) has to be a single
-- UPDATE, not a special case bolted onto every read. Storing it also makes
-- "who expires when" indexable and displayable.
--
-- ROLE SCOPING IS THE LOAD-BEARING DETAIL HERE. Retention applies to STUDENTS
-- and to nobody else. A super-admin or an institution admin caught by an expiry
-- sweep would lose the account that administers the system, so:
--
--   - the backfill below sets expires_at for role = 'student' only;
--   - provisioning sets it only when creating a student;
--   - the partial index only covers students, so any query that drives off it
--     is scoped by construction.
--
-- No purge job ships with this migration. These columns are the record of when
-- an account is due and whether it is live; acting on them is a separate change,
-- and one that deletes real people's data should not arrive as a side effect of
-- adding a registration form.
-- =============================================================================

alter table public.profiles
  add column if not exists expires_at     timestamptz,
  add column if not exists deactivated_at timestamptz;

comment on column public.profiles.expires_at is
  'Retention deadline: created_at + 1 year, set at provisioning for students only. NULL on admin/superadmin rows and on any account exempt from retention. Stored rather than computed so it can be extended.';
comment on column public.profiles.deactivated_at is
  'NULL = live. Set = an admin switched the account off; the Supabase login is banned but nothing is deleted. Every read that lists ACTIVE students must filter `deactivated_at is null`.';

-- Existing students get the same clock, measured from when they were created.
-- `where role = 'student'` is not an optimisation — it is the guard that keeps
-- admins out of retention entirely.
update public.profiles
   set expires_at = created_at + interval '1 year'
 where role = 'student'
   and expires_at is null;

-- "Which students are due?" — the only query these columns exist to answer.
create index if not exists profiles_expiry_idx
  on public.profiles (expires_at)
  where role = 'student' and expires_at is not null;

-- "Which students are switched off?" — read on every admin list.
create index if not exists profiles_deactivated_idx
  on public.profiles (deactivated_at)
  where deactivated_at is not null;
