-- 011_institution_logo_url.sql
-- Persist the institution logo URL so the admin dashboard and institution list can
-- render the college branding without storing an image blob in Postgres.

alter table public.institutions
  add column if not exists logo_url text;
