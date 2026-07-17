import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Pages
import LandingPage from './pages/LandingPage';
import HomePage from './pages/HomePage';
import LeaderboardPage from './pages/LeaderboardPage';

// Components
import Header from './components/Header';
import Footer from './components/Footer';
import SignIn from './components/SignIn';
import ResetPassword from './components/ResetPassword';
import Leaderboard from './components/Leaderboard';
import ProgressAnalytics from './components/ProgressAnalytics';
import TaskTracker from './components/TaskTracker';
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

// Tasks Page Component (Full Page)
const TasksPage = () => {
  const tasks = [
    { id: 1, title: 'Solve 3 LeetCode problems', completed: true },
    { id: 2, title: 'Participate in Codeforces contest', completed: false },
    { id: 3, title: 'Complete system design task', completed: false },
    { id: 4, title: 'Push code to GitHub', completed: true },
    { id: 5, title: 'Review pull requests', completed: false },
    { id: 6, title: 'Update technical documentation', completed: false }
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Daily Tasks</h1>
          <p className="text-gray-600">
            Track your daily coding goals and stay consistent
          </p>
        </div>
        <TaskTracker tasks={tasks} expanded={true} />
      </div>
    </div>
  );
};

// Progress Analytics Page Component (Full Page)
const ActivityPage = () => {
  return <ProgressAnalytics />;
};

// Profile Page Placeholder
const ProfilePage = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Profile</h1>
          <p className="text-gray-600">Profile page coming soon...</p>
        </div>
      </div>
    </div>
  );
};

// Settings Page Placeholder
const SettingsPage = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Settings</h1>
          <p className="text-gray-600">Settings page coming soon...</p>
        </div>
      </div>
    </div>
  );
};

function App() {
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
          theme="light"
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
          
          {/* Tasks Page Route */}
          <Route path="/tasks" element={
            <ProtectedRoute>
              <TasksPage />
            </ProtectedRoute>
          } />
          
          {/* Progress Analytics Page Route */}
          <Route path="/activity" element={
            <ProtectedRoute>
              <ActivityPage />
            </ProtectedRoute>
          } />
          
          {/* Profile Page Route */}
          <Route path="/profile" element={
            <ProtectedRoute>
              <ProfilePage />
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

          {/* Individual Component Routes (if needed for testing) */}
          <Route path="/components/leaderboard" element={
            <div className="min-h-screen bg-gray-50">
              <Header />
              <div className="container mx-auto py-8 px-4">
                <Leaderboard />
              </div>
              <Footer />
            </div>
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
          
          {/* Legacy Routes with Authentication Guard */}
          <Route path="/dash" element={
            <AdminRoute>
              <Navigate to="/admin/dashboard" replace />
            </AdminRoute>
          } />
          
          {/* 404 Route - catch all unmatched routes */}
          <Route path="*" element={
            <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50">
              <div className="text-center max-w-md mx-auto p-8">
                <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h1 className="text-4xl font-bold text-gray-900 mb-4">404 - Page Not Found</h1>
                <p className="text-lg text-gray-600 mb-8">
                  The page you are looking for does not exist or you don't have permission to access it.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <a 
                    href="/" 
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold text-center"
                  >
                    Return to Homepage
                  </a>
                  <a 
                    href="/dashboard" 
                    className="px-6 py-3 bg-gray-600 text-white rounded-xl hover:bg-gray-700 transition-colors font-semibold text-center"
                  >
                    Go to Dashboard
                  </a>
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
