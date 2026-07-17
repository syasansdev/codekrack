// src/components/ResetPassword.jsx
//
// Where the "set your password" email lands. Handles both cases with the same
// screen — a new student choosing their first password, and an existing user
// who forgot theirs — because from here they're the same act.
//
// HOW THE TOKEN WORKS: the emailed link carries a recovery token in the URL
// fragment. supabase-js (detectSessionInUrl: true) reads it, exchanges it for a
// short-lived session and fires PASSWORD_RECOVERY. That session can do exactly
// one useful thing: updateUser({ password }). So we are briefly "signed in"
// while having no password — which is why this route is public, and why it signs
// the user out afterwards rather than dropping them into the app on a session
// that came from an email link.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';

const MIN_LENGTH = 8;

const ResetPassword = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState('checking'); // checking | ready | saving | done | invalid
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [email, setEmail] = useState('');

  useEffect(() => {
    let alive = true;

    // The event can arrive either before or after this mounts, depending on how
    // fast supabase-js parses the fragment — so listen AND check the current
    // session, rather than relying on the race going one way.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setEmail(session?.user?.email || '');
        setPhase('ready');
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data?.session) {
        setEmail(data.session.user?.email || '');
        setPhase('ready');
      } else {
        // No session and no recovery token: the link is spent, expired, or
        // someone navigated here directly.
        setPhase('invalid');
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setPhase('saving');
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(
        /should be different|same as/i.test(err.message)
          ? 'That is already your current password. Choose a different one.'
          : err.message
      );
      setPhase('ready');
      return;
    }

    // Sign out deliberately. The session we're holding came from a link in an
    // inbox, not from someone typing a password — so make them prove they know
    // the password they just chose. It also confirms it actually works, right
    // now, rather than the first time they're locked out.
    await supabase.auth.signOut();
    setPhase('done');
  };

  if (phase === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="h-10 w-10 rounded-full border-[3px] border-blue-100 border-t-orange-500 animate-spin" />
      </div>
    );
  }

  if (phase === 'invalid') {
    return (
      <Shell title="This link has expired">
        <p className="text-sm text-fg-subtle leading-relaxed">
          Set-password links can only be used once, and expire an hour after they&apos;re sent.
        </p>
        <p className="mt-3 text-sm text-fg-subtle leading-relaxed">
          Ask your administrator to send you a new one from the Student Access screen.
        </p>
        <button onClick={() => navigate('/signin')} className="btn-ghost w-full justify-center mt-6">
          Back to sign in
        </button>
      </Shell>
    );
  }

  if (phase === 'done') {
    return (
      <Shell title="Password set">
        <p className="text-sm text-fg-subtle leading-relaxed">
          Your password is ready. Sign in with it to get started.
        </p>
        <button onClick={() => navigate('/signin')} className="btn-accent w-full justify-center mt-6">
          Sign in
        </button>
      </Shell>
    );
  }

  return (
    <Shell title="Choose your password">
      {email && (
        <p className="text-sm text-fg-subtle mb-5">
          for <span className="font-medium text-fg-muted">{email}</span>
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="pw" className="block text-sm font-medium text-fg-muted mb-1">
            New password
          </label>
          <input
            id="pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
            className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition"
            placeholder={`At least ${MIN_LENGTH} characters`}
          />
        </div>
        <div>
          <label htmlFor="pw2" className="block text-sm font-medium text-fg-muted mb-1">
            Confirm password
          </label>
          <input
            id="pw2"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition"
            placeholder="Type it again"
          />
        </div>

        {error && (
          <div role="alert" className="p-3 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg">
            {error}
          </div>
        )}

        <button type="submit" disabled={phase === 'saving'} className="btn-accent w-full justify-center">
          {phase === 'saving' ? 'Saving…' : 'Set password'}
        </button>
      </form>
    </Shell>
  );
};

const Shell = ({ title, children }) => (
  <div className="min-h-screen flex items-center justify-center bg-brand-gradient-soft p-4">
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface rounded-xl p-7 sm:p-8 w-full max-w-md shadow-elite-lg"
    >
      <div className="mb-5">
        <div className="font-display text-lg font-bold gradient-text mb-4">CodeKrack</div>
        <h1 className="font-display text-2xl font-bold text-fg">{title}</h1>
      </div>
      {children}
    </motion.div>
  </div>
);

export default ResetPassword;
