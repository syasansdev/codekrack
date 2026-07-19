import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Pages
import LandingPage from './pages/LandingPage';
import HomePage from './pages/HomePage';
import LeaderboardPage from './pages/LeaderboardPage';
import AchievementsPage from './pages/AchievementsPage';

// Components
import Header from './components/Header';
import Footer from './components/Footer';
import SignIn from './components/SignIn';
import ResetPassword from './components/ResetPassword';
import Leaderboard from './components/Leaderboard';
import ProgressAnalytics from './components/ProgressAnalytics';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from './components/ProtectedRoute';

// Admin Components
import AdminSignIn from './components/AdminSignIn';
import AdminRoute from './components/AdminRoute';
import AdminDashboard from './components/AdminDashboard';
import AdminUserCreation from './components/AdminUserCreation';
import StudentList from './components/StudentList';
import AdminStudentsList from './components/AdminStudentsList';
import ScrapingStatus from './components/ScrapingStatus';
import AdminLeaderboard from './components/AdminLeaderboard';
import Profile from './components/Profile';
import ChangePassword from './components/ChangePassword';
import StudentPasswordManager from './components/StudentPasswordManager';
import SuperAdminRoute from './components/SuperAdminRoute';
import InstitutionManagement from './components/InstitutionManagement';

// QueryBot (AI query assistant)
import QueryBot from './components/QueryBot';

// Auth Context
import { AuthProvider } from './contexts/AuthContext';
import { useTheme } from './contexts/ThemeContext';
import ContestNotifications from './components/ContestNotifications';
import WeeklyScheduler from './components/WeeklyScheduler';

// NOTE: ProtectedRoute now lives in ./components/ProtectedRoute and actually
// checks for a session. The version that used to be defined right here was
// named ProtectedRoute but only rendered <Header/>{children}<Footer/> — no auth
// check at all — so every "protected" student route rendered for anyone who
// typed the URL.
//
// Also gone from this file: the window.* debug backdoors that were mounted in
// development —
//   window.createAdminAccount(email, password, name)
//   window.createMissingUserProfile({ role: 'user' })
// Both wrote straight to Firestore from the browser, i.e. self-service admin
// creation from the console. They are deleted along with adminSetup.js and
// debugAuth.js. Account creation is server-side only now.

// /tasks was removed. TaskTracker held six hardcoded tasks ("Solve 3 LeetCode
// problems", "Push code to GitHub") and stored nothing — no API, no database,
// not even localStorage, so anything a student added vanished on refresh. It was
// a mockup of a feature, shown to real users, and nothing in the app even linked
// to it. Deleted rather than left to look like a broken feature.

// Progress Analytics Page Component (Full Page)
const ActivityPage = () => {
  return <ProgressAnalytics />;
};

// ProfilePage and SettingsPage were "coming soon" placeholders. /profile is
// linked from the app in two places and rendered the placeholder, while
// /settings quietly rendered the REAL <Profile/> — so the working page was the
// one nobody linked to. Both routes now render the real component.

function App() {
  // react-toastify renders its own surfaces, so it can't read our CSS tokens —
  // it needs telling. Left hardcoded to "light" it would fire a white toast
  // over a near-black page: the one element on screen that ignores the theme.
  const { theme } = useTheme();

  return (
    // BrowserRouter wraps AuthProvider because the guards inside it use
    // useNavigate/useLocation, which need a router above them.
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme={theme}
        />
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/signin" element={<SignIn isOpen={true} />} />
          <Route path="/admin/signin" element={<AdminSignIn isOpen={true} />} />
          {/* Where the set-password email lands. Public by necessity: the whole
              point is that the person arriving here has no password yet. Their
              authority comes from the single-use recovery token in the link,
              which supabase-js exchanges for a short-lived session. */}
          <Route path="/reset-password" element={<ResetPassword />} />
          
          {/* Main App Routes - Dashboard (HomePage) */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          } />
          
          {/* Legacy home route - redirect to dashboard */}
          <Route path="/home" element={<Navigate to="/dashboard" replace />} />
          
          {/* Leaderboard Page Route */}
          <Route path="/leaderboard" element={
            <ProtectedRoute>
              <LeaderboardPage />
            </ProtectedRoute>
          } />
          
          {/* Progress Analytics Page Route */}
          <Route path="/activity" element={
            <ProtectedRoute>
              <ActivityPage />
            </ProtectedRoute>
          } />

          {/* Achievements Page Route */}
          <Route path="/achievements" element={
            <ProtectedRoute>
              <AchievementsPage />
            </ProtectedRoute>
          } />
          
          {/* /profile and /settings both render the real Profile. /profile used
              to show a "coming soon" placeholder despite being the linked one. */}
          <Route path="/profile" element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          } />
          
          {/* Settings Page Route */}
          <Route path="/settings" element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          } />

          {/* /achievements removed: AchievementSystem ranked students by a
              profile-level `totalSolved` that nothing ever wrote, so every rank
              was computed from 0, and it fetched the ENTIRE users collection to
              do it. Deleted rather than migrated. */}

          {/* Individual Component Routes (if needed for testing).
              Now behind ProtectedRoute (SEC-06). It was the one route in the
              app with no guard at all; it only *appeared* safe because Header's
              effect bounces a signed-out visitor to "/" — i.e. the protection
              was a side effect of a nav component, which any redesign of that
              component would have quietly removed. The data always 401'd, so
              this leaked a shell rather than records, but a route's safety
              shouldn't depend on where its header navigates. */}
          <Route path="/components/leaderboard" element={
            <ProtectedRoute>
              <div className="min-h-screen bg-canvas">
                <Header />
                <div className="container mx-auto py-8 px-4">
                  <Leaderboard />
                </div>
                <Footer />
              </div>
            </ProtectedRoute>
          } />
          
          {/* Admin Routes with Authentication Guard.
              AdminRoute renders <Outlet />, so the nested routes below are its
              children. It previously read `<AdminRoute><AdminLayout /></AdminRoute>`,
              but AdminRoute ignores `children` — AdminLayout never rendered at
              all, and each admin screen draws its own sidebar. Passing it was
              misleading, so it's gone. */}
          <Route path="/admin" element={<AdminRoute />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="institutions" element={<SuperAdminRoute><InstitutionManagement /></SuperAdminRoute>} />
            <Route path="students" element={<StudentList />} />
            <Route path="manage-students" element={<AdminStudentsList />} />
            {/* students/:id removed: StudentDetails called db.collection() (the
                v8 namespaced API) on a v9 modular instance, so every load threw
                `db.collection is not a function`. The page never worked once. */}
            <Route path="add-student" element={<AdminUserCreation />} />
            <Route path="scraping-status" element={<ScrapingStatus />} />
            <Route path="leaderboard" element={<AdminLeaderboard />} />
            <Route path="passwords" element={<StudentPasswordManager />} />
            <Route path="querybot" element={<QueryBot />} />
            <Route path="notifications" element={<ContestNotifications />} />
            <Route path="scheduler" element={<WeeklyScheduler />} />
          </Route>
          
          {/* Legacy alias for /admin/dashboard.
              This used to read <AdminRoute><Navigate .../></AdminRoute>, which
              rendered a BLANK PAGE: AdminRoute returns <Outlet /> and ignores
              children, exactly as the comment on /admin above already noted, so
              the <Navigate> inside it never ran. Wrapping the redirect in a
              guard was pointless anyway — /admin/dashboard is itself guarded,
              so a non-admin who follows this bounces off AdminRoute there. */}
          <Route path="/dash" element={<Navigate to="/admin/dashboard" replace />} />
          
          {/* 404 Route - catch all unmatched routes */}
          <Route path="*" element={
            <div className="min-h-screen flex flex-col items-center justify-center bg-canvas surface-mesh px-4">
              <div className="text-center max-w-md mx-auto p-8">
                <div className="w-24 h-24 bg-tint-danger rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-12 h-12 text-on-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h1 className="text-4xl font-bold text-fg mb-4">404 — Page not found</h1>
                <p className="text-lg text-fg-muted mb-8">
                  The page you are looking for does not exist or you don't have permission to access it.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  {/* Kept as <a>, not <Link>: a full document load is the right
                      recovery from an unknown URL — it re-runs the theme
                      bootstrap and clears any half-mounted state. */}
                  <a href="/" className="btn-primary">Return to homepage</a>
                  <a href="/dashboard" className="btn-ghost">Go to dashboard</a>
                </div>
              </div>
            </div>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
