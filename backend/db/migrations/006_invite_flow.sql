-- =============================================================================
-- 006_invite_flow.sql — delete the plaintext passwords.
--
-- WHAT WAS WRONG: profiles.temp_password held every student's password in
-- readable text. Anything that could read the profiles table could read every
-- student's live credential — a backup, a support query, a leaked service_role
-- key, a future bug in one endpoint. /admin/passwords existed to display them,
-- and Add Student exported them to CSV, so they also lived in spreadsheets,
-- inboxes and Downloads folders forever.
--
-- The password was never ours to hold.
--
-- THE NEW FLOW (standard, and the reason it's standard):
--   1. The account is created with crypto.randomBytes(32) — a value nobody ever
--      sees, not even us. It is not a "temporary password"; it is unusable.
--   2. A set-password link is emailed immediately.
--   3. The student chooses their own password, which we only ever see hashed by
--      Supabase Auth.
--
-- Nobody can hand over a password they don't know, so nobody can leak one.
--
-- COLUMNS:
--   temp_password, temp_password_created_at  DROPPED. Good riddance.
--   requires_password_reset                  DROPPED. It meant "hasn't set their
--     own password yet" — but under this flow a student CANNOT sign in until
--     they do, so the flag can only ever restate what auth.users.last_sign_in_at
--     already knows, and only ever go stale.
--   invited_at                               NEW. When the set-password email
--     was last sent, so an admin can see who's been chased and re-send.
-- =============================================================================

alter table public.profiles drop column if exists temp_password;
alter table public.profiles drop column if exists temp_password_created_at;
alter table public.profiles drop column if exists requires_password_reset;

alter table public.profiles
  add column if not exists invited_at timestamptz;

comment on column public.profiles.invited_at is
  'When the set-password email was last sent. Whether they have USED it is auth.users.last_sign_in_at — do not duplicate that here, it would only drift.';

-- Who has been invited but never signed in. The admin UI reads this instead of
-- a flag we would have to remember to clear.
create index if not exists profiles_invited_idx
  on public.profiles (invited_at)
  where invited_at is not null;
