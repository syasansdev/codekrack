// src/lib/queryClient.js
//
// React Query is the source of truth for all server state. Nothing in this app
// should copy fetched data into useState and try to keep the two in sync —
// that's the class of bug this whole layer exists to remove.
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../services/api';

// ---- staleTime, and why the numbers differ ---------------------------------
//
// staleTime = how long data is trusted without refetching.
//
// The leaderboard and scraping status are PUSH-invalidated over SSE: the moment
// Postgres changes, the server tells us and we refetch. Time-based refetching on
// top of that is pure waste — it cannot be more current than a push, it just
// costs requests. So they get Infinity: they refetch when something ACTUALLY
// changed, and never merely because a timer expired.
//
// Everything else has no push channel, so it uses a short human-scale window.
export const STALE = {
  /** SSE-backed. Only refetches on an actual database change. */
  realtime: Infinity,
  /** Changes only when an admin does something; mutations invalidate it anyway. */
  standard: 60_000,
  /** Rarely changes. */
  static: 5 * 60_000,
};

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE.standard,
        // Keep unused data for 5 min so navigating back to a screen paints
        // instantly from cache while it revalidates.
        gcTime: 5 * 60_000,

        // Refetching on every window focus is the default, and it fights SSE:
        // alt-tabbing would refetch data we already know is current. SSE tells
        // us when to refetch; focus tells us nothing.
        refetchOnWindowFocus: false,
        // Do refetch when the network comes back — SSE events that fired while
        // offline were missed, and the stream reconnect can't replay them.
        refetchOnReconnect: true,

        retry: (failureCount, error) => {
          // Retrying an auth or permission failure just burns requests and
          // delays the redirect to sign-in. Neither will succeed on attempt 2.
          if (error instanceof ApiError) {
            if (error.status === 401 || error.status === 403 || error.status === 404) return false;
          }
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        // A failed write must never be retried automatically: "create student"
        // is not idempotent, and a retry could create two.
        retry: false,
      },
    },
  });

export default createQueryClient;
