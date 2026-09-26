-- NO_TRANSACTION
-- Add 'hackerearth' to the platform_kind enum type. Kept in its own file: a new
-- enum value cannot be used in the same transaction that adds it, and 014
-- (student_totals) names it.
ALTER TYPE public.platform_kind ADD VALUE IF NOT EXISTS 'hackerearth';
