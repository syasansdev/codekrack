// src/hooks/queries/useStudents.js
//
// Student server-state. React Query owns it — components read from these hooks
// and never copy the result into useState.
//
// Every mutation invalidates what it actually touched, so no screen has to
// remember to refresh itself after a write.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studentsApi } from '../../services/api';
import { queryKeys } from '../../lib/queryKeys';
import { STALE } from '../../lib/queryClient';

/**
 * Scoped student list.
 * institutionId is a hint for super-admins picking a college; the SERVER decides
 * the real scope, so passing nothing (or someone else's id) can't widen access.
 */
export const useStudents = ({ institutionId = null, enabled = true } = {}) =>
  useQuery({
    queryKey: queryKeys.students.list(institutionId),
    queryFn: ({ signal }) => studentsApi.list({ institutionId, signal }),
    staleTime: STALE.standard,
    enabled,
  });

export const useStudent = (id, { enabled = true } = {}) =>
  useQuery({
    queryKey: queryKeys.students.detail(id),
    queryFn: ({ signal }) => studentsApi.detail(id, { signal }),
    enabled: Boolean(id) && enabled,
  });

/** The signed-in student's own record. */
export const useMyProfile = ({ enabled = true } = {}) =>
  useQuery({
    queryKey: queryKeys.me.profile(),
    queryFn: ({ signal }) => studentsApi.me({ signal }),
    staleTime: STALE.standard,
    enabled,
  });

/**
 * Who can actually sign in — students AND institution admins, with their invite
 * status. There are no passwords to read any more; this reports access, not
 * secrets. staleTime 0 because an admin lands here right after sending an
 * invite and needs to see it reflected.
 */
export const useStudentAccess = ({ institutionId = null, enabled = true } = {}) =>
  useQuery({
    queryKey: queryKeys.students.access(institutionId),
    queryFn: ({ signal }) => studentsApi.access({ institutionId, signal }),
    staleTime: 0,
    enabled,
  });

// ---- mutations -------------------------------------------------------------

/** The signed-in student editing their own profile. */
export const useUpdateMyProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => studentsApi.updateMe(data),
    onSuccess: (student) => {
      // The server returns the saved row — seed it rather than refetch.
      if (student) qc.setQueryData(queryKeys.me.profile(), student);
      // The name may show in admin lists too.
      qc.invalidateQueries({ queryKey: queryKeys.students.lists() });
    },
  });
};

export const useCreateStudent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => studentsApi.create(data),
    onSuccess: () => {
      // Broad on purpose: a new student changes the lists, the dashboard counts
      // and the scraping queue. Invalidating the prefix beats trying to name
      // every affected key and missing one.
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      qc.invalidateQueries({ queryKey: queryKeys.scraping.all });
    },
  });
};

export const useUpdateStudent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => studentsApi.update(id, data),
    onSuccess: (student, { id }) => {
      // The server returns the updated row, so seed the detail cache with it
      // instead of refetching what we were just handed.
      if (student) qc.setQueryData(queryKeys.students.detail(id), student);
      qc.invalidateQueries({ queryKey: queryKeys.students.lists() });
      // Editing a platform URL resets that platform to pending.
      qc.invalidateQueries({ queryKey: queryKeys.scraping.all });
    },
  });
};

export const useDeleteStudent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => studentsApi.remove(id),
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: queryKeys.students.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      qc.invalidateQueries({ queryKey: queryKeys.leaderboard.all });
      qc.invalidateQueries({ queryKey: queryKeys.scraping.all });
    },
  });
};

/** (Re)sends the set-password email. Does not alter the current password. */
export const useSendInvite = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => studentsApi.sendInvite(id),
    onSuccess: () => {
      // invited_at moved, so the Access screen's status column is now stale.
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
};

export const useRescrapeStudent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => studentsApi.rescrape(id),
    onSuccess: () => {
      // The rows flip to 'pending' immediately; the results arrive later over
      // SSE when the scraper actually runs.
      qc.invalidateQueries({ queryKey: queryKeys.scraping.all });
    },
  });
};
