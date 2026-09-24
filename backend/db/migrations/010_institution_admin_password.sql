-- 010_institution_admin_password.sql
-- Persist the current live admin password on each institution so the super-admin
-- list can display the active login credential without re-deriving it.
--
-- This is intentionally a plaintext field to satisfy the operational requirement
-- that the current login password be visible in the institution table.

alter table public.institutions
  add column if not exists admin_password text;
