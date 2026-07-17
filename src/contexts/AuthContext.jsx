// src/contexts/AuthContext.jsx
//
// Session state, on Supabase Auth.
//
// Keeps the same contract the app already uses — { currentUser, userData,
// logout, changePassword, loading } — so components don't all have to change at
// once. What's underneath is different in three ways that matter:
//
//  1. userData comes from the API (a React Query cache entry), not a direct
//     database read. The browser cannot reach Postgres at all.
//  2. Privilege lives in userData.role, resolved server-side on every request.
//     Nothing here decides what an admin may do; it only decides what to render.
//  3. logout() CLEARS the query cache. Without that, the next person to sign in
//     on this browser would be handed the previous user's cached students out
//     of memory before their own first fetch returns.
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useMyProfile } from '../hooks/queries/useStudents';
import { useRealtimeInvalidation } from '../hooks/useRealtimeInvalidation';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const queryClient = useQueryClient();
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Who the cache currently belongs to. A ref, not state: it must be readable
  // inside the auth callback without re-subscribing the listener on every change.
  const cachedUserId = useRef(null);

  useEffect(() => {
    let active = true;

    // getSession() reads the persisted session from storage, so a reload doesn't
    // flash the signed-out UI before auth rehydrates.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data?.session ?? null);
      cachedUserId.current = data?.session?.user?.id ?? null;
      setAuthLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!active) return;
      setSession(newSession);
      setAuthLoading(false);

      // ---------------------------------------------------------------------
      // ONLY clear the cache when the IDENTITY actually changes.
      //
      // 'SIGNED_IN' does NOT mean "someone just signed in". supabase-js fires it
      // on every tab focus:
      //
      //   visibilitychange -> _onVisibilityChanged(false) -> _recoverAndRefresh()
      //     -> _notifyAllSubscribers('SIGNED_IN', currentSession)
      //   (GoTrueClient.js — verified in the installed 2.110.7)
      //
      // This previously ran removeQueries(['me']) on that event. Switching to
      // another tab and back therefore dropped the profile, which made
      // `loading` true, which rendered <AuthSplash/> INSTEAD OF children — so
      // the entire app unmounted and every half-typed form was wiped. It looked
      // like "the data disappears when I switch tabs", because it did.
      //
      // Comparing user ids makes the intent explicit and the event name
      // irrelevant: same person => leave the cache alone, whatever fired.
      // ---------------------------------------------------------------------
      const prevUserId = cachedUserId.current;
      const nextUserId = newSession?.user?.id ?? null;
      cachedUserId.current = nextUserId;

      // Same person => the cache is still theirs. This is the common case: tab
      // focus and hourly token refresh both land here.
      if (prevUserId === nextUserId) return;

      // Nobody -> somebody (a fresh sign-in, or INITIAL_SESSION on page load).
      // Nothing to clear — and clearing would be actively harmful: SignIn seeds
      // the profile with fetchQuery() before navigating, and the auth event can
      // arrive after that, wiping the very data we just fetched.
      if (prevUserId === null) return;

      // Somebody -> nobody (signed out), or somebody -> SOMEONE ELSE.
      // Both mean the cache belongs to a person who is no longer here, so it
      // must not survive: the next user would otherwise be served the previous
      // one's students out of memory before their own first fetch returns.
      queryClient.clear();
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  // The profile — role, institutionId, is_admin — resolved by the server.
  //
  // isLoading (NOT isFetching) on purpose: isLoading is true only when there is
  // no data yet. A background revalidation must never be allowed to reach the
  // splash below, or the app blinks out mid-typing every time the profile is
  // refetched for any reason.
  const {
    data: userData,
    isLoading: profileLoading,
    error: profileError,
  } = useMyProfile({ enabled: Boolean(session) });

  // Hold the SSE stream open only while signed in. When `enabled` flips false on
  // logout the hook aborts the stream, which is the "cleanup on logout"
  // requirement — otherwise it would keep streaming as the previous user.
  const realtime = useRealtimeInvalidation(Boolean(session) && Boolean(userData));

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    // Clear regardless: if sign-out failed we still must not leave one user's
    // data sitting in cache for the next one.
    queryClient.clear();
    if (error) throw new Error(error.message);
    return { success: true };
  }, [queryClient]);

  /**
   * Verifies the current password before changing it.
   * Supabase would let updateUser({password}) through on session alone, but that
   * means anyone at an unlocked laptop can change the password without knowing
   * the old one. Re-checking preserves the guarantee the Firebase version had.
   */
  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      if (!session?.user?.email) throw new Error('No user is currently logged in');
      if (!newPassword || newPassword.length < 8) {
        throw new Error('New password must be at least 8 characters.');
      }

      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: currentPassword,
      });
      if (reauthError) {
        throw new Error(
          /invalid/i.test(reauthError.message)
            ? 'Current password is incorrect.'
            : `Could not verify your current password: ${reauthError.message}`
        );
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        throw new Error(
          /weak|short|characters/i.test(error.message)
            ? 'New password is too weak. Use at least 8 characters.'
            : `Failed to update password. ${error.message}`
        );
      }

      // The student is no longer on a temp password.
      queryClient.invalidateQueries({ queryKey: ['me'] });
      return { success: true, message: 'Password updated successfully!' };
    },
    [session, queryClient]
  );

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email || '').trim(),
      password,
    });
    if (error) {
      // Supabase says "Invalid login credentials" for both a wrong password and
      // an unknown email — deliberately, so the form can't enumerate accounts.
      throw new Error(
        /invalid login/i.test(error.message)
          ? 'Incorrect email or password.'
          : /email not confirmed/i.test(error.message)
            ? 'This account has not been confirmed yet. Ask an admin to re-issue it.'
            : error.message
      );
    }
    return data.user;
  }, []);

  const value = {
    // Session
    currentUser: session?.user ?? null,
    session,
    // Profile (server-resolved)
    userData: userData ?? null,
    profileError,
    // Derived role flags — for RENDERING only. The server re-checks every request.
    role: userData?.role ?? null,
    isAdmin: userData?.isAdmin === true,
    isSuperAdmin: userData?.isSuperAdmin === true,
    institutionId: userData?.institutionId ?? null,
    // Actions
    signIn,
    logout,
    changePassword,
    // Realtime stream health, for a status dot in the UI
    realtime,
    // True until we know BOTH whether there's a session and who it belongs to.
    // Gating on session alone would let an admin page render before role is
    // known, flashing UI the user may not be allowed to see.
    //
    // Note this is FIRST-LOAD loading: profileLoading is isLoading, which goes
    // false once we have a profile and stays false through later revalidations.
    loading: authLoading || (Boolean(session) && profileLoading),
  };

  // Gate the tree until identity AND role are known — route guards rely on it,
  // and rendering early would flash admin chrome before we know the person is
  // an admin.
  //
  // `!userData` is the important half. Unmounting `children` throws away every
  // component's local state: what's typed in a form, which modal is open, where
  // you'd scrolled. That is only an acceptable price when we have NOTHING to
  // render — i.e. the very first load. Once a profile exists, the tree stays
  // mounted through any refetch, so a background revalidation can never wipe
  // half-finished work again.
  const showSplash = value.loading && !userData;

  return (
    <AuthContext.Provider value={value}>
      {showSplash ? <AuthSplash /> : children}
    </AuthContext.Provider>
  );
};

/** Shown only while the session/profile resolves — normally a few hundred ms. */
const AuthSplash = () => (
  <div className="min-h-screen flex items-center justify-center bg-white">
    <div className="flex flex-col items-center gap-4">
      <div className="h-10 w-10 rounded-full border-[3px] border-blue-100 border-t-orange-500 animate-spin" />
      <p className="text-sm font-medium text-ink-400">Loading CodeKrack…</p>
    </div>
  </div>
);

export default AuthContext;
