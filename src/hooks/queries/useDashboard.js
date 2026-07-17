// src/hooks/queries/useDashboard.js
//
// Dashboard stats, leaderboards and scraping status.
//
// The leaderboard and scraping-status queries use staleTime: Infinity. That is
// not a mistake — they are the two SSE-backed surfaces. A push tells us the
// instant Postgres changes, so a timer could only ever refetch data we already
// know is current. They go stale on a real event, never on a clock.
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../../services/api';
import { queryKeys } from '../../lib/queryKeys';
import { STALE } from '../../lib/queryClient';

export const PLATFORMS = ['leetcode', 'github', 'codeforces', 'atcoder'];

/** Labels match each platform's real headline metric — GitHub counts repos, not problems. */
export const METRIC_LABEL = {
  leetcode: 'Problems Solved',
  github: 'Repositories',
  codeforces: 'Problems Solved',
  atcoder: 'Problems Solved',
};

export const useDashboardStats = ({ institutionId = null, enabled = true } = {}) =>
  useQuery({
    queryKey: queryKeys.dashboard.stats(institutionId),
    queryFn: ({ signal }) => dashboardApi.stats({ institutionId, signal }),
    staleTime: STALE.standard,
    enabled,
  });

/** Admin leaderboard. SSE-invalidated. */
export const useLeaderboard = ({
  platform = 'leetcode',
  institutionId = null,
  limit = 100,
  enabled = true,
} = {}) =>
  useQuery({
    queryKey: queryKeys.leaderboard.admin(platform, institutionId),
    queryFn: ({ signal }) => dashboardApi.leaderboard({ platform, institutionId, limit, signal }),
    staleTime: STALE.realtime,
    // Keep the previous platform's rows on screen while the next loads, so
    // switching tabs doesn't flash an empty table.
    placeholderData: (prev) => prev,
    enabled,
  });

/** Student-facing leaderboard — the server scopes it to the caller's institution. */
export const useStudentLeaderboard = ({ platform = 'leetcode', limit = 100, enabled = true } = {}) =>
  useQuery({
    queryKey: queryKeys.leaderboard.student(platform),
    queryFn: ({ signal }) => dashboardApi.studentLeaderboard({ platform, limit, signal }),
    staleTime: STALE.realtime,
    placeholderData: (prev) => prev,
    enabled,
  });

/** Scraping status. SSE-invalidated — this is what makes a running scrape visible live. */
export const useScrapingStatus = ({ institutionId = null, enabled = true } = {}) =>
  useQuery({
    queryKey: queryKeys.scraping.status(institutionId),
    queryFn: ({ signal }) => dashboardApi.scrapingStatus({ institutionId, signal }),
    staleTime: STALE.realtime,
    enabled,
  });
