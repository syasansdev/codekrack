// src/hooks/useRealtimeInvalidation.js
//
// Holds the SSE stream open and turns server signals into React Query
// invalidations. Mount this ONCE, near the root, while signed in.
//
//   Postgres change -> trigger -> pg_notify -> Express (one LISTEN connection)
//     -> SSE 'invalidate' {topics} -> queryClient.invalidateQueries(prefix)
//       -> React Query refetches through the normal, scoped API
//
// The stream never carries data — only which topics went stale. That's what
// keeps SSE from becoming a second, unguarded read path.
//
// Why @microsoft/fetch-event-source instead of the browser's EventSource:
// EventSource cannot send an Authorization header. The usual workaround is
// ?token=<jwt>, which writes access tokens into server logs, proxy logs and
// browser history. This library is fetch-based, so the stream authenticates
// exactly like every other request.
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { getAccessToken } from '../lib/supabase';
import { TOPIC_INVALIDATIONS } from '../lib/queryKeys';
import { BASE_URL } from '../services/api';

/** Thrown to tell fetchEventSource to stop retrying — see onerror below. */
class FatalStreamError extends Error {}

export const useRealtimeInvalidation = (enabled = true) => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('idle'); // idle | connecting | live | error
  const [lastEventAt, setLastEventAt] = useState(null);
  const ctrlRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return undefined;
    }

    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    let cancelled = false;

    setStatus('connecting');

    fetchEventSource(`${BASE_URL}/api/events`, {
      signal: ctrl.signal,

      // Called on connect AND on every reconnect, so the token is re-read each
      // time rather than captured once. A stream that outlives its access token
      // would otherwise reconnect with an expired one and 401-loop.
      async onopen(res) {
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.includes('text/event-stream')) {
          if (!cancelled) setStatus('live');
          return;
        }
        if (res.status === 401 || res.status === 403) {
          // Signed out or demoted. Retrying cannot fix either.
          throw new FatalStreamError(`SSE auth failed (${res.status})`);
        }
        throw new Error(`SSE failed to open (${res.status})`); // retryable
      },

      onmessage(msg) {
        if (msg.event === 'connected') return; // handshake
        if (msg.event !== 'invalidate') return;

        let topics = [];
        try {
          ({ topics = [] } = JSON.parse(msg.data));
        } catch {
          return;
        }

        // Translate database topics into the query prefixes that care.
        // A prefix invalidates every key beneath it, so one 'platform_stats'
        // event refreshes all four leaderboard platforms at once.
        const prefixes = topics.flatMap((t) => TOPIC_INVALIDATIONS[t] || []);
        for (const queryKey of prefixes) {
          queryClient.invalidateQueries({ queryKey });
        }
        if (prefixes.length && !cancelled) setLastEventAt(Date.now());
      },

      onerror(err) {
        if (err instanceof FatalStreamError) {
          if (!cancelled) setStatus('error');
          throw err; // rethrow => fetchEventSource gives up
        }
        if (!cancelled) setStatus('connecting');
        // Returning a number = retry after N ms. The backend restarting, a
        // laptop waking, a dropped tunnel — all recover on their own.
        return 3000;
      },

      onclose() {
        // The server ended the stream cleanly (deploy/restart). Throwing here
        // would stop retrying; we want to reconnect to the new instance.
        throw new Error('stream closed by server');
      },

      // Without this the stream is dropped when the tab is backgrounded, and an
      // admin returning to a tab would silently be looking at stale numbers.
      openWhenHidden: true,

      fetch: async (url, init) => {
        const token = await getAccessToken();
        return fetch(url, {
          ...init,
          headers: { ...init.headers, Authorization: `Bearer ${token}` },
        });
      },
    }).catch(() => {
      // Terminal (fatal auth, or aborted). State is already set; swallow so an
      // unmount doesn't surface as an unhandled rejection.
    });

    // Cleanup on unmount AND on sign-out (enabled flips false). Without this the
    // stream survives logout, still authenticated as the previous user.
    return () => {
      cancelled = true;
      ctrl.abort();
      ctrlRef.current = null;
      setStatus('idle');
    };
  }, [enabled, queryClient]);

  return { status, lastEventAt, isLive: status === 'live' };
};

export default useRealtimeInvalidation;
