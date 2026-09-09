// src/hooks/queries/useInstitutions.js
//
// Institution server-state. Creating an institution also provisions its admin's
// login, so these mutations touch auth as well as data — which is exactly why
// they live behind the API rather than in a component.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { institutionsApi } from '../../services/api';
import { queryKeys } from '../../lib/queryKeys';
import { STALE } from '../../lib/queryClient';

/** Super-admins get every institution; an institution admin gets only their own. */
export const useInstitutions = ({ enabled = true } = {}) =>
  useQuery({
    queryKey: queryKeys.institutions.list(),
    queryFn: ({ signal }) => institutionsApi.list({ signal }),
    staleTime: STALE.static, // institutions change rarely
    enabled,
  });

/**
 * The colleges shown in the registration dropdown. No session required — this
 * runs on the public landing page, before the visitor has an account at all.
 *
 * staleTime is STALE.static for the same reason as the admin list: a college is
 * onboarded by a super-admin now and then, not minute to minute.
 */
export const usePublicInstitutions = ({ enabled = true } = {}) =>
  useQuery({
    queryKey: queryKeys.institutions.public(),
    queryFn: ({ signal }) => institutionsApi.publicList({ signal }),
    staleTime: STALE.static,
    // A visitor who mistypes nothing should not be told to retry three times
    // because the API is briefly down; the form shows the error and a retry.
    retry: 1,
    enabled,
  });

/** Creates the institution AND its admin login. Returns { id, adminUid, adminEmail }. */
export const useCreateInstitution = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => institutionsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.institutions.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all }); // institution count
    },
  });
};

/** Pass adminPassword to reset the institution admin's login password. */
export const useUpdateInstitution = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => institutionsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.institutions.all });
      // A password reset changes what /admin/passwords shows.
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
};

/** Deletes the institution + its admin login. Students survive, unlinked. */
export const useDeleteInstitution = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => institutionsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.institutions.all });
      // Its students are now unlinked, so every scoped list is wrong.
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      qc.invalidateQueries({ queryKey: queryKeys.leaderboard.all });
    },
  });
};
