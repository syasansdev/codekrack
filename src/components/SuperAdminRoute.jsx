// src/components/SuperAdminRoute.jsx
//
// Guards super-admin-only screens (currently /admin/institutions). Nested inside
// AdminRoute, so by the time this renders the user is already a verified admin —
// this only asks the further question of whether they're the SUPER admin.
//
// Rendering only. POST/PATCH/DELETE /api/institutions is behind verifySuperAdmin
// on the server, which re-reads the role from the database on every request. If
// this component were bypassed entirely, the API would still refuse.
import React, { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';

const SuperAdminRoute = ({ children }) => {
  const { isSuperAdmin, loading, currentUser } = useAuth();
  const toldThem = useRef(false);

  useEffect(() => {
    if (loading || toldThem.current) return;
    if (currentUser && !isSuperAdmin) {
      toast.error('Super-admin access required');
      toldThem.current = true;
    }
  }, [loading, currentUser, isSuperAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-10 w-10 rounded-full border-[3px] border-blue-100 border-t-orange-500 animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) return <Navigate to="/admin/dashboard" replace />;

  return children;
};

export default SuperAdminRoute;
