-- =============================================================================
-- 015_year_of_passing_out.sql — Year of Study -> Year of Passing Out + Section
--
-- profiles.year stays the column (text), but it now holds a calendar year
-- ("2029"), not an ordinal ("3" / "3rd Year"). Year of Passing Out is the
-- single source of truth after this migration.
--
-- Formula, matching the product examples for academic year 2026-27:
--   Passing Out Year = Academic Year Start Year + (Course Duration - Current Year of Study)
-- Academic year "2026-27" uses start year 2026 (June–May calendar).
--
-- Course duration is inferred from the department name:
--   Engineering / B.Des          4 years
--   BCA / BSc / BA / BCom / BBA  3 years
--   MCA / M.Tech / M.E / M.Sc    2 years
--   anything else                4 years, or the student's current year if higher
--
-- Rows that already look like a calendar year (19xx / 20xx) are left alone —
-- they are already passing-out years. Unreadable year-of-study values are also
-- left alone rather than guessed.
--
-- Section is new. Existing students have no section recorded, so they get N/A.
-- New onboarding requires A–Z.
-- =============================================================================

alter table public.profiles
  add column if not exists section text not null default 'N/A';

comment on column public.profiles.year is
  'Year of Passing Out (calendar year as text, e.g. 2029). Migration 015 converted leftover year-of-study ordinals using course duration and the current academic year. New rows write a picker year directly.';
comment on column public.profiles.section is
  'Class section A–Z for new students. Existing rows with no section are N/A.';

-- Convert ordinal year-of-study values. Calendar years are skipped.
update public.profiles p
   set year = (
     (
       case
         when extract(month from now()) >= 6 then extract(year from now())::int
         else extract(year from now())::int - 1
       end
     )
     + (
       greatest(
         case
           when p.department ~* '^(MCA|M\.?\s*Tech|M\.?\s*E|M\.?\s*Sc)\y' then 2
           when p.department ~* '^(BCA|BSc)\y' then 3
           when p.department ~* 'Bachelor of Computer Applications' then 3
           when p.department ~* 'Bachelor of Science' then 3
           when p.department ~* 'Bachelor of Arts' then 3
           when p.department ~* 'Bachelor of Commerce' then 3
           when p.department ~* '^(BBA)\y' then 3
           when p.department ~* 'Bachelor of Business' then 3
           when p.department ~* 'Bachelor of Design' then 4
           when p.department ~* 'Engineering' then 4
           when p.department ~* '^Bachelor of' then 3
           else 4
         end,
         -- study year digit, so a 4th-year student is never given a 3-year duration
         case
           when lower(btrim(p.year)) ~ '(^|[^a-z])iv([^a-z]|$)|fourth' then 4
           when lower(btrim(p.year)) ~ '(^|[^a-z])iii([^a-z]|$)|third' then 3
           when lower(btrim(p.year)) ~ '(^|[^a-z])ii([^a-z]|$)|second' then 2
           when lower(btrim(p.year)) ~ '(^|[^a-z])i([^a-z]|$)|first' then 1
           when btrim(p.year) ~ '[1-4]' then substring(btrim(p.year) from '[1-4]')::int
           else 1
         end
       )
       -
       case
         when lower(btrim(p.year)) ~ '(^|[^a-z])iv([^a-z]|$)|fourth' then 4
         when lower(btrim(p.year)) ~ '(^|[^a-z])iii([^a-z]|$)|third' then 3
         when lower(btrim(p.year)) ~ '(^|[^a-z])ii([^a-z]|$)|second' then 2
         when lower(btrim(p.year)) ~ '(^|[^a-z])i([^a-z]|$)|first' then 1
         when btrim(p.year) ~ '[1-4]' then substring(btrim(p.year) from '[1-4]')::int
         else 1
       end
     )
   )::text
 where p.role = 'student'
   and btrim(coalesce(p.year, '')) <> ''
   and btrim(p.year) !~ '^(19|20)\d{2}$'
   and (
        lower(btrim(p.year)) ~ '(^|[^a-z])(i|ii|iii|iv)([^a-z]|$)|first|second|third|fourth'
        or btrim(p.year) ~ '[1-4]'
   );

update public.profiles
   set section = 'N/A'
 where role = 'student'
   and (section is null or btrim(section) = '');

create index if not exists profiles_year_idx
  on public.profiles (year)
  where role = 'student' and year <> '';

create index if not exists profiles_section_idx
  on public.profiles (section)
  where role = 'student' and section <> '';
