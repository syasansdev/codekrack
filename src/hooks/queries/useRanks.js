// src/hooks/queries/useRanks.js
//
// Rank tier thresholds — read by every student (to render their own badge)
// and edited by admins (RankManagement). STALE.static because an admin
// changes these rarely; the update mutation invalidates immediately anyway.
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

export const useUpdateRankThresholds = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ institutionId, thresholds }) => ranksApi.updateThresholds({ institutionId, thresholds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ranks.all });
    },
  });
};
