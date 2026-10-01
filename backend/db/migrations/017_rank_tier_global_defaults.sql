-- 017_rank_tier_global_defaults.sql
--
-- Adds a global/"All institutions" scope to rank tiers, on top of 016.
--
-- institution_id becomes nullable: a NULL row is a super-admin-set default
-- that applies to every institution that hasn't configured its own override
-- for that (rank, platform) cell. The merge happens in rankRoutes.js — an
-- institution-specific row for a given rank+platform always wins over the
-- global one; where an institution has nothing set, the global value (if any)
-- is used instead.
--
-- The original `unique (institution_id, rank_key, platform)` constraint does
-- not do what's needed once institution_id can be NULL: Postgres treats every
-- NULL as distinct, so it would happily accept two different "global" rows
-- for the same rank+platform. Replaced with a unique index over
-- coalesce(institution_id, <sentinel>), which folds every NULL onto the same
-- value for uniqueness purposes while leaving the column itself NULL.
alter table public.rank_tier_thresholds
  alter column institution_id drop not null;

alter table public.rank_tier_thresholds
  drop constraint if exists rank_tier_thresholds_institution_id_rank_key_platform_key;

create unique index if not exists rank_tier_thresholds_scope_unique_idx
  on public.rank_tier_thresholds (
    coalesce(institution_id, '00000000-0000-0000-0000-000000000000'::uuid),
    rank_key,
    platform
  );

comment on column public.rank_tier_thresholds.institution_id is
  'NULL = global default (super-admin, applies to every institution unless overridden). Otherwise scoped to one institution.';
