-- =============================================================================
-- 011_canonical_departments_cse.sql — the variant 010 missed.
--
-- 010 was written from a department tally that had been TRUNCATED for display,
-- so the largest variant of all never appeared in it:
--
--   Computer Science and Engineering (CSE)   83
--   Computer Science and Engineering         54
--
-- One department, 137 students, rendering as two groups — the exact problem 010
-- set out to fix, on the biggest cohort in the database.
--
-- Same rule as 010: this is a bracketed abbreviation of a name already on the
-- canonical list, so it is a formatting variant and safe to rewrite. It is a
-- separate migration rather than an edit to 010 because 010 is already applied
-- and its checksum is recorded; editing an applied file would either be skipped
-- silently or trip the runner's mismatch check.
--
-- Still deliberately NOT mapped, for the reasons given in 010 — each is a real
-- ambiguity, and a confidently wrong department is worse than an untidy one:
--
--   Cyber Security                 5
--   Computer Applications          4
--   Data Science                   4
--   Computer Science               2
--   Artificial Intelligence        1
--   Data Science / Data Analytics  1
--   (blank)                        8
-- =============================================================================

update public.profiles
   set department = 'Computer Science and Engineering'
 where role = 'student'
   and department = 'Computer Science and Engineering (CSE)';
