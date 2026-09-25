-- 012_institution_logo_public_id.sql
-- Persist the Cloudinary public_id alongside the URL so a logo can be safely
-- replaced without leaving stale assets behind in the media bucket.

alter table public.institutions
  add column if not exists logo_public_id text;
