-- =============================================================================
-- 010_canonical_departments.sql — collapse the department spellings.
--
-- WHAT WAS WRONG. profiles.department was free text, written mostly by
-- spreadsheet imports, and 287 students held NINETEEN distinct values for about
-- eight real departments:
--
--   Artificial Intelligence & Machine Learning (AI & ML)   61
--   Artificial Intelligence and Machine Learning            1
--   AI                                                      1
--
-- Three spellings of one course, and nothing downstream could tell. Every
-- department filter, every per-department count and every grouping split them
-- silently — a cohort of 63 rendered as three groups, and the two small ones
-- looked like data-entry noise rather than the same students.
--
-- Registration now picks from a fixed list (src/lib/departments.js and its
-- backend twin), so new rows cannot fragment again. This migration fixes the
-- rows that already did.
--
-- WHAT IS AND IS NOT MAPPED. Only unambiguous formatting variants are rewritten:
-- "&" for "and", a trailing abbreviation in brackets, or a code whose meaning
-- the old dropdown recorded ("AI" was labelled "AI & ML" in AdminUserCreation).
--
-- Genuinely ambiguous values are LEFT ALONE on purpose:
--
--   Cyber Security                 5   -- BSc? BCA? CSE (Cyber Security)?
--   Computer Applications          4   -- BCA, or the CS course?
--   Data Science                   4   -- Data Science and Engineering? BSc?
--   Computer Science               2   -- CSE, or BSc Computer Science?
--   Data Science / Data Analytics  1
--   Artificial Intelligence        1   -- AI Engineering? AI & DS? AI & ML?
--   (blank)                        8
--
-- Guessing at those would move students into a department they are not in, and
-- a wrong department is worse than an untidy one because it looks correct. They
-- keep their current value, still display fine, and can be corrected by an admin
-- from the student edit form.
-- =============================================================================

update public.profiles p
   set department = m.canonical
  from (values
    -- '&' -> 'and', and drop the bracketed abbreviation
    ('Artificial Intelligence & Machine Learning (AI & ML)', 'Artificial Intelligence and Machine Learning'),
    ('Artificial Intelligence & Data Science (AI & DS)',     'Artificial Intelligence and Data Science'),
    ('Information Technology (IT)',                          'Information Technology'),
    ('Electronics and Communication Engineering (ECE)',      'Electronics and Communication Engineering'),
    ('Computer Science and Business Systems (CSBS)',         'Computer Science and Business Systems'),
    -- Old dropdown codes. 'AI' is safe because the option that wrote it was
    -- labelled "AI & ML" (AdminUserCreation.jsx, before this change).
    ('IT',                                                   'Information Technology'),
    ('AI',                                                   'Artificial Intelligence and Machine Learning')
  ) as m(variant, canonical)
 where p.role = 'student'
   and p.department = m.variant;

-- The department filters read this column on every admin list.
create index if not exists profiles_department_idx
  on public.profiles (department)
  where role = 'student' and department <> '';

comment on column public.profiles.department is
  'Free-text column, but new values come from the fixed list in src/lib/departments.js (and its backend twin) — registration rejects anything else. Migration 010 collapsed the spelling variants that predate the list. Bulk import stays tolerant, so unrecognised names from spreadsheets can still appear here.';
