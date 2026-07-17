// src/components/AdminRoute.jsx
//
// Guards every /admin/* screen. Renders the nested routes via <Outlet />.
//
// SECURITY NOTE — what this replaced. The previous version did:
//
//     const storedAdmin = localStorage.getItem('adminUser');
//     if (adminData && adminData.role === 'admin') { setIsAdmin(true); return; }
//
// localStorage is writable by anyone with devtools open, so typing
//   localStorage.setItem('adminUser', '{"role":"admin"}')
// was enough to render the whole admin UI. It also cached that verdict, so a
// demoted admin kept access until they happened to clear their browser storage.
//
// Now the role comes from AuthContext, which reads it from the server on every
// page load and re-verifies it on every API call. Nothing the browser stores can
// grant access, and this component decides RENDERING only — the API is the
// actual boundary and re-checks independently.
import React, { useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';

const AdminRoute = () => {
  const { currentUser, isAdmin, loading, profileError } = useAuth();
  const location = useLocation();
  const toldThem = useRef(false);

  // Fire the toast from an effect, not during render: toasting mid-render
  // mutates another component's state and React warns about it.
  useEffect(() => {
    if (loading || toldThem.current) return;
    if (!currentUser) {
      toast.error('Please sign in to access the admin dashboard');
      toldThem.current = true;
    } else if (!isAdmin) {
      toast.error('Access denied: admin privileges required');
      toldThem.current = true;
    }
  }, [loading, currentUser, isAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <div className="h-12 w-12 mx-auto rounded-full border-[3px] border-blue-100 border-t-orange-500 animate-spin" />
          <p className="mt-4 text-sm font-medium text-ink-400">Verifying admin access…</p>
        </div>
      </div>
    );
  }

  // A signed-in account whose profile won't load is NOT an admin. Failing closed
  // matters: a network blip must never be mistaken for a grant.
  if (profileError || !currentUser || !isAdmin) {
    return <Navigate to="/admin/signin" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
};

export default AdminRoute;
