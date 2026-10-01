// src/hooks/queries/useRanks.js
//
// Rank tier thresholds.
//   useRankThresholds — EFFECTIVE (merged) thresholds for one institution.
//     Read by every student (to render their own badge) and by the admin's
//     "view student" modal.
//   useRawRankThresholds — the UNMERGED rows for exactly one scope. Backs the
//     super-admin-only Rank Tiers editor: pass { global: true } for the "All
//     institutions" defaults, or { institutionId } for one college.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ranksApi } from '../../services/api';
import { queryKeys } from '../../lib/queryKeys';
import { STALE } from '../../lib/queryClient';

export const useRankThresholds = ({ institutionId, enabled = true } = {}) =>
  useQuery({
    queryKey: queryKeys.ranks.thresholds(institutionId),
    queryFn: ({ signal }) => ranksApi.thresholds({ institutionId, signal }),
    staleTime: STALE.static,
    enabled,
  });

export const useRawRankThresholds = ({ institutionId, global = false, enabled = true } = {}) =>
  useQuery({
    queryKey: queryKeys.ranks.raw(global ? 'global' : institutionId),
    queryFn: ({ signal }) => ranksApi.rawThresholds({ institutionId, global, signal }),
    staleTime: STALE.static,
    enabled: enabled && (global || Boolean(institutionId)),
  });

export const useUpdateRankThresholds = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ institutionId = null, thresholds }) => ranksApi.updateThresholds({ institutionId, thresholds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ranks.all });
    },
  });
};
