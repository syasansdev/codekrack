// src/components/AdminSignIn.jsx
//
// Admin sign-in. Used by both institution admins (whose password the
// super-admin set when creating their institution) and the super-admin.
//
// WHAT CHANGED, AND WHY IT MATTERS: the old version finished by writing the
// session into localStorage —
//     localStorage.setItem('adminUser', JSON.stringify({ role: 'admin' }));
//     localStorage.setItem('isAdmin', 'true');
// — and AdminRoute then TRUSTED those values. Anyone could set them by hand in
// devtools and walk into the admin UI. Nothing is stored here any more: the
// session lives in Supabase Auth, and the role is resolved by the server on
// every single request.
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { studentsApi } from '../services/api';
import { queryKeys } from '../lib/queryKeys';

const AdminSignIn = ({ isOpen = true, onClose = () => {} }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { signIn, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [isFocused, setIsFocused] = useState({ email: false, password: false });

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

      // The role comes from the server, not from the sign-in response.
      const profile = await queryClient.fetchQuery({
        queryKey: queryKeys.me.profile(),
        queryFn: () => studentsApi.me(),
      });

      if (!profile) {
        setAuthError('User profile not found. Please contact your administrator.');
        await logout();
        setAuthLoading(false);
        return;
      }

      if (!profile.isAdmin) {
        // Valid credentials, wrong door. Sign them out rather than leaving a
        // student holding a live session on the admin screen.
        setAuthError('Access denied: admin privileges required');
        await logout();
        setAuthLoading(false);
        return;
      }

      handleClose();
      navigate('/admin/dashboard');
    } catch (error) {
      setAuthError(error.message || 'An error occurred during sign in');
      setAuthLoading(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setPassword('');
    setAuthError(null);
    onClose();
  };
  
  const goToStudentLogin = () => {
    navigate('/signin');
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        when: "beforeChildren",
        staggerChildren: 0.1
      }
    },
    exit: {
      opacity: 0,
      transition: {
        when: "afterChildren",
        staggerChildren: 0.05,
        staggerDirection: -1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 24
      }
    },
    exit: {
      y: -20,
      opacity: 0,
      transition: {
        duration: 0.2
      }
    }
  };

  const inputVariants = {
    focused: {
      scale: 1.02,
    //   boxShadow: "0 10px 25px -5px rgba(59, 130, 246, 0.4), 0 5px 10px -5px rgba(59, 130, 246, 0.2)",
      transition: { duration: 0.2 }
    },
    unfocused: {
      scale: 1,
    //   boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
      transition: { duration: 0.2 }
    }
  };

  const buttonVariants = {
    initial: { scale: 1 },
    tap: { scale: 0.95 },
    hover: { 
      scale: 1.02,
      boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
    },
    loading: {
      scale: [1, 1.02, 1],
      transition: {
        duration: 1,
        repeat: Infinity,
        ease: "easeInOut"
      }
    }
  };

  const errorVariants = {
    hidden: { 
      height: 0, 
      opacity: 0,
      marginTop: 0,
      paddingTop: 0,
      paddingBottom: 0
    },
    visible: { 
      height: "auto",
      opacity: 1,
      marginTop: 16,
      paddingTop: 12,
      paddingBottom: 12,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 24
      }
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Modal scrim.
            Was `bg-white-100/10` — not a real Tailwind class (`white` has no
            numeric scale), so it compiled to nothing and this element rendered
            with blur but no dim at all. Verified against a real Tailwind build:
            `.bg-white-100` is absent from the generated CSS.

            A scrim stays dark in BOTH themes on purpose — its job is to push the
            page back behind the dialog, and a light scrim over a light page does
            not do that. This is why it is ink-950 rather than a surface token. */}
        <motion.div
          className="absolute inset-0 bg-ink-950/50 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        />
        
        {/* Floating Background Elements */}
        <motion.div
          className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-500/20 rounded-full blur-xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-40 h-40 bg-purple-500/20 rounded-full blur-xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.4, 0.2, 0.4],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />

        <motion.div
          className="relative w-full max-w-md"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <motion.div
            className="bg-gradient-to-br from-surface to-surface-2/95 border border-white/20 rounded-2xl p-8 shadow-2xl backdrop-blur-sm relative overflow-hidden"
            variants={itemVariants}
            whileHover={{ 
              scale: 1.01,
              transition: { duration: 0.2 }
            }}
          >
            {/* Animated Border Glow */}
            <motion.div
              className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-indigo-500/10"
              animate={{
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-fg-subtle hover:text-fg-muted text-2xl font-light z-10 w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-3/50 transition-colors"
              aria-label="Close"
            >
              <motion.span
                whileHover={{ rotate: 90 }}
                transition={{ duration: 0.2 }}
              >
                &times;
              </motion.span>
            </button>
            
            <motion.div 
              className="text-center mb-8 relative"
              variants={itemVariants}
            >
              <motion.div
                className="absolute -top-4 left-1/2 transform -translate-x-1/2 w-16 h-1 bg-gradient-to-r from-blue-500 to-blue-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: 64 }}
                transition={{ delay: 0.5, duration: 0.8 }}
              />
              <div className="flex justify-center mt-4 mb-3">
                <img
                  src="/Codekrack - Big.jpg"
                  alt="CodeKrack"
                  className="h-14 w-auto object-contain"
                  style={{ maxWidth: '200px' }}
                />
              </div>
              <motion.h2 
                className="text-3xl font-bold   mt-2 mb-2"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                Admin Sign In
              </motion.h2>
              <motion.p 
                className="text-fg-subtle text-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                Secure Administrative Access
              </motion.p>
            </motion.div>
            
            <motion.div 
              className="space-y-6 relative"
              variants={containerVariants}
            >
              <form onSubmit={handleEmailSignIn} className="space-y-6">
                <motion.div variants={itemVariants}>
                  <label htmlFor="admin-email" className="block text-sm font-semibold text-fg-muted mb-2 ml-1">
                    Email Address
                  </label>
                  <motion.input
                    id="admin-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setIsFocused(prev => ({ ...prev, email: true }))}
                    onBlur={() => setIsFocused(prev => ({ ...prev, email: false }))}
                    className="w-full px-4 py-3 bg-surface/80 border border-edge rounded-xl text-fg placeholder-fg-subtle focus:outline-none backdrop-blur-sm"
                    placeholder="admin@example.com"
                    autoComplete="email"
                    variants={inputVariants}
                    animate={isFocused.email ? "focused" : "unfocused"}
                  />
                </motion.div>
                
                <motion.div variants={itemVariants}>
                  <label htmlFor="admin-password" className="block text-sm font-semibold text-fg-muted mb-2 ml-1">
                    Password
                  </label>
                  <motion.input
                    id="admin-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setIsFocused(prev => ({ ...prev, password: true }))}
                    onBlur={() => setIsFocused(prev => ({ ...prev, password: false }))}
                    className="w-full px-4 py-3 bg-surface/80 border border-edge rounded-xl text-fg placeholder-fg-subtle focus:outline-none backdrop-blur-sm"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    variants={inputVariants}
                    animate={isFocused.password ? "focused" : "unfocused"}
                  />
                </motion.div>
                
                <AnimatePresence>
                  {authError && (
                    <motion.div
                      className="text-red-700 text-sm bg-red-50/80 border border-red-200 rounded-xl text-center backdrop-blur-sm"
                      variants={errorVariants}
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                    >
                      {authError}
                    </motion.div>
                  )}
                </AnimatePresence>
                
                <motion.button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-3.5 px-4 bg-blue-600 text-white font-semibold rounded-xl shadow-lg relative overflow-hidden"
                  variants={buttonVariants}
                  initial="initial"
                  whileHover={authLoading ? "loading" : "hover"}
                  whileTap="tap"
                  animate={authLoading ? "loading" : "initial"}
                >
                  {/* Animated button background */}
                  <motion.div
                    className="absolute inset-0 opacity-0"
                    whileHover={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  />
                  
                  <span className="relative z-10">
                    {authLoading ? (
                      <motion.span className="flex items-center justify-center">
                        <motion.svg 
                          className="mr-2 h-4 w-4 text-white" 
                          xmlns="http://www.w3.org/2000/svg" 
                          fill="none" 
                          viewBox="0 0 24 24"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        >
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </motion.svg>
                        Authenticating...
                      </motion.span>
                    ) : (
                      <motion.span
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        Sign In as Admin
                      </motion.span>
                    )}
                  </span>
                </motion.button>
              </form>
              
              <motion.div 
                className="text-center pt-4 border-t border-edge/50"
                variants={itemVariants}
              >
                <motion.button 
                  onClick={goToStudentLogin}
                  className="text-sm bg-gradient-to-r from-fg-muted to-fg-subtle bg-clip-text text-transparent font-medium hover:from-fg hover:to-fg-muted transition-all duration-300"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Not an admin? Go to Student Login →
                </motion.button>
              </motion.div>

              {/* Syasans branding */}
              <motion.div
                className="flex items-center justify-center gap-2 pt-3"
                variants={itemVariants}
              >
                <span className="text-xs text-fg-subtle">Powered by</span>
                <a href="https://syasans.com/" target="_blank" rel="noopener noreferrer">
                  <img
                    src="/colour BIG.jpg"
                    alt="Syasans Career Analytics"
                    className="h-5 w-auto object-contain opacity-60 hover:opacity-100 transition-opacity"
                    style={{ maxWidth: '100px' }}
                  />
                </a>
              </motion.div>
            </motion.div>

            {/* Footer decorative element */}
            <motion.div
              className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-24 h-1 bg-gradient-to-r from-blue-500 to-blue-500 rounded-full opacity-50"
              initial={{ width: 0 }}
              animate={{ width: 96 }}
              transition={{ delay: 0.8, duration: 0.8 }}
            />
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AdminSignIn;