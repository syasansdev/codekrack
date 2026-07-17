// src/components/ProtectedRoute.jsx
//
// Guards the student-facing screens: Header + page + Footer, but only for a
// signed-in user.
//
// This REPLACES two things that were both wrong:
//
//  1. The old src/components/ProtectedRoute.jsx, which was never imported by
//     anything and redirected to /login — a route this app does not have.
//
//  2. App.jsx's inline component of the same name, which despite the name did
//     no checking at all:
//         const ProtectedRoute = ({ children, hideFooter }) => (
//           <><Header />{children}{!hideFooter && <Footer />}</>
//         );
//     Every "protected" student route rendered for anyone who typed the URL.
//     The data calls failed with 401, so nothing leaked, but the app shell and
//     empty dashboards were visible to logged-out visitors.
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Header from './Header';
import Footer from './Footer';

const ProtectedRoute = ({ children, hideFooter = false }) => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="h-10 w-10 rounded-full border-[3px] border-blue-100 border-t-orange-500 animate-spin" />
      </div>
    );
  }

  // Remember where they were headed so sign-in can return them there.
  if (!currentUser) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }

  return (
    <>
      <Header />
      {children}
      {!hideFooter && <Footer />}
    </>
  );
};

export default ProtectedRoute;
