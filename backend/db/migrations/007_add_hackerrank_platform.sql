-- NO_TRANSACTION
-- Add 'hackerrank' to the platform_kind enum type
ALTER TYPE public.platform_kind ADD VALUE IF NOT EXISTS 'hackerrank';
