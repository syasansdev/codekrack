import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { studentsApi } from '../services/api';
import { queryKeys } from '../lib/queryKeys';

// Sign-in modal (students + admins).
//
// EMAIL AND PASSWORD, AND NOTHING ELSE. There is no social or federated option
// here and there is no place for one: a profile row is keyed to the uid its
// account was created with, so a second identity provider would mint a
// different uid for the same person and the profile lookup would fail with
// NO_PROFILE — an account that authenticates perfectly and can reach nothing.
// Adding one needs an identity-linking flow, not a button.

const SignIn = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    setAuthError(null);

    if (!email || !password) {
      setAuthError('Email and password are required');
      return;
    }

    setAuthLoading(true);
    try {
      await signIn(email, password);

      // Fetch the profile explicitly rather than waiting for the context to
      // settle: we need the ROLE to know where to send them, and navigating
      // first would bounce an admin through the student home page.
      // fetchQuery also seeds the cache, so the context doesn't refetch.
      const profile = await queryClient.fetchQuery({
        queryKey: queryKeys.me.profile(),
        queryFn: () => studentsApi.me(),
      });

      if (!profile) {
        setAuthError('Your profile could not be loaded. Please contact your administrator.');
        setAuthLoading(false);
        return;
      }

      onClose?.();
      // isAdmin covers admin AND superadmin — it's generated from role in the
      // database, so there's no list of role strings here to fall out of sync.
      navigate(profile.isAdmin ? '/admin/dashboard' : '/home');
    } catch (error) {
      setAuthError(error.message || 'An error occurred during sign in');
      setAuthLoading(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setPassword('');
    setAuthError(null);
    onClose?.();
  };

  if (!isOpen) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-surface rounded-xl p-6 sm:p-8 w-full max-w-md shadow-elite-lg relative"
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-fg-subtle hover:text-fg-muted"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <img
              src="/Codekrack - Big.jpg"
              alt="CodeKrack"
              className="h-14 w-auto object-contain"
              style={{ maxWidth: '200px' }}
            />
          </div>
          <h2 className="font-display text-2xl font-bold text-fg mb-1">Sign In</h2>
          <p className="text-fg-subtle">Welcome back to CodeKrack!</p>
        </div>

        <form onSubmit={handleEmailSignIn} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-fg-muted mb-1">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition"
              placeholder="Enter your email"
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-fg-muted mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition"
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </div>

          {authError && (
            <div role="alert" className="p-3 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg">
              {authError}
            </div>
          )}

          <button type="submit" disabled={authLoading} className="btn-accent w-full justify-center">
            {authLoading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Signing in…
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="text-center mt-4">
          <p className="text-sm text-fg-subtle">
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={() => {
                handleClose();
                navigate('/register');
              }}
              className="font-semibold text-blue-600 hover:underline"
            >
              Create one
            </button>
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default SignIn;
