// src/components/admin/AdminShell.jsx
//
// The app shell for every /admin/* screen.
//
// Mounted once, from AdminRoute's <Outlet />, so all eleven admin routes get
// the same chrome from a single place. Before this, /admin/dashboard drew its
// own 288px sidebar inline and the other ten screens had a back button — so the
// admin area read as ten separate pages that happened to share a login, and the
// nav was unreachable from any of them without going back to the dashboard
// first.
//
// The shell owns navigation and identity. Pages own their content and nothing
// else — no page should draw its own sidebar or back button again.
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  Bot,
  Building2,
  CalendarClock,
  ChevronDown,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Radar,
  Trophy,
  UserCog,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import useAdminScope from '../../hooks/useAdminScope';
import ThemeToggle from '../ui/ThemeToggle';

// One source of truth for the admin nav. The old sidebar hand-wrote each item
// with its own inline <svg> and its own hover colour, which is why no two
// looked quite alike. Adding a screen means adding a line here.
//
// `superOnly` is a UI affordance ONLY — it hides a link a non-super admin
// cannot use. It is not the boundary: /admin/institutions is wrapped in
// SuperAdminRoute, and the API re-derives the caller's role on every request.
const NAV = [
  {
    section: null,
    items: [{ to: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard }],
  },
  {
    section: 'Students',
    items: [
      { to: '/admin/students', label: 'Directory', icon: Users },
      { to: '/admin/manage-students', label: 'Manage', icon: UserCog },
      { to: '/admin/add-student', label: 'Add student', icon: UserPlus },
      { to: '/admin/passwords', label: 'Access', icon: KeyRound },
    ],
  },
  {
    section: 'Insights',
    items: [
      { to: '/admin/leaderboard', label: 'Leaderboard', icon: Trophy },
      { to: '/admin/scraping-status', label: 'Scraping', icon: Radar },
      { to: '/admin/querybot', label: 'QueryBot', icon: Bot },
    ],
  },
  {
    section: 'Organisation',
    items: [
      { to: '/admin/institutions', label: 'Institutions', icon: Building2, superOnly: true },
      { to: '/admin/notifications', label: 'Notifications', icon: Bell },
      { to: '/admin/scheduler', label: 'Scheduler', icon: CalendarClock },
    ],
  },
];

const titleFor = (pathname) => {
  for (const group of NAV) {
    const hit = group.items.find((i) => i.to === pathname);
    if (hit) return hit.label;
  }
  return 'Admin';
};

const initialsOf = (name, email) => {
  const source = (name || email || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
};

/* ── Sidebar nav link ─────────────────────────────────────────────────────── */
const NavItem = ({ item, onNavigate }) => {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      // NavLink resolves `active` from the router itself. The old sidebar
      // compared location.pathname by hand in each item, which is how
      // /admin/students and /admin/manage-students both managed to look active
      // at the same time.
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium
         transition-colors duration-150
         ${
           isActive
             ? 'bg-tint-brand text-on-brand'
             : 'text-fg-muted hover:bg-surface-3 hover:text-fg'
         }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="admin-nav-active"
              className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-500"
              transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            />
          )}
          <Icon size={17} strokeWidth={2} className="shrink-0" />
          <span className="truncate">{item.label}</span>
          {item.superOnly && (
            <span className="ml-auto rounded bg-tint-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-accent">
              Super
            </span>
          )}
        </>
      )}
    </NavLink>
  );
};

/* ── Sidebar ──────────────────────────────────────────────────────────────── */
const SidebarContent = ({ isSuperAdmin, scopeLabel, onNavigate }) => (
  <div className="flex h-full flex-col">
    {/* Brand */}
    <Link
      to="/admin/dashboard"
      onClick={onNavigate}
      className="flex items-center gap-3 px-5 py-5"
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-gradient text-sm font-bold text-white shadow-glow-blue">
        CK
      </span>
      <span className="leading-tight">
        <span className="block font-display text-[15px] font-bold text-fg">CodeKrack</span>
        <span className="block text-[11px] font-medium text-fg-subtle">by Syasans</span>
      </span>
    </Link>

    {/* Scope. A super-admin's numbers span every institution and an institution
        admin's do not — showing which is on screen prevents the two from being
        read as the same figure. */}
    <div className="mx-5 mb-4 rounded-xl border border-edge bg-surface-2 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
        {isSuperAdmin ? 'Viewing' : 'Institution'}
      </p>
      <p className="truncate text-[13px] font-semibold text-fg" title={scopeLabel}>
        {scopeLabel}
      </p>
    </div>

    <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
      {NAV.map((group) => {
        const items = group.items.filter((i) => !i.superOnly || isSuperAdmin);
        if (items.length === 0) return null;
        return (
          <div key={group.section ?? 'root'}>
            {group.section && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                {group.section}
              </p>
            )}
            <div className="space-y-0.5">
              {items.map((item) => (
                <NavItem key={item.to} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  </div>
);

/* ── Shell ────────────────────────────────────────────────────────────────── */
const AdminShell = ({ children }) => {
  const { userData, currentUser, logout, isSuperAdmin } = useAuth();
  const { institutionName } = useAdminScope();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile drawer on navigation. Without this it stays open over the
  // page you just asked for, which reads as the tap not having worked.
  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  // Escape closes whatever is open. Cheap, and expected of a real dialog.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setMobileOpen(false);
      setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const name = userData?.name || userData?.displayName || currentUser?.email || 'Admin';
  const email = userData?.email || currentUser?.email || '';
  const scopeLabel = isSuperAdmin ? 'All institutions' : institutionName || 'Your institution';

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      // Navigate regardless. If signOut throws (offline, expired token), the
      // local session is gone either way and leaving the user parked on an
      // admin screen would be worse than a redirect.
      navigate('/admin/signin', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-edge bg-surface lg:block">
        <SidebarContent isSuperAdmin={isSuperAdmin} scopeLabel={scopeLabel} />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-ink-950/50 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-64 border-r border-edge bg-surface lg:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            >
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="absolute right-3 top-5 grid h-8 w-8 place-items-center rounded-lg text-fg-subtle hover:bg-surface-3 hover:text-fg"
              >
                <X size={17} />
              </button>
              <SidebarContent
                isSuperAdmin={isSuperAdmin}
                scopeLabel={scopeLabel}
                onNavigate={() => setMobileOpen(false)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main column */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-edge bg-surface/80 px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="grid h-9 w-9 place-items-center rounded-xl border border-edge bg-surface-2 text-fg-muted hover:text-fg lg:hidden"
          >
            <Menu size={17} />
          </button>

          <h1 className="font-display text-[17px] font-bold tracking-tightest text-fg">
            {titleFor(location.pathname)}
          </h1>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />

            {/* Account menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 rounded-xl border border-edge bg-surface-2 py-1 pl-1 pr-2 transition-colors hover:border-edge-strong"
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-gradient text-[11px] font-bold text-white">
                  {initialsOf(userData?.name, email)}
                </span>
                <span className="hidden max-w-[10rem] truncate text-sm font-medium text-fg sm:block">
                  {name}
                </span>
                <ChevronDown size={14} className="text-fg-subtle" />
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <>
                    {/* Click-away layer. Sits under the menu, over everything
                        else, so the next click anywhere closes it instead of
                        activating whatever it landed on. */}
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setMenuOpen(false)}
                      aria-hidden="true"
                    />
                    <motion.div
                      role="menu"
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ duration: 0.14 }}
                      className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border border-edge bg-surface shadow-elite-lg"
                    >
                      <div className="border-b border-edge px-4 py-3">
                        <p className="truncate text-sm font-semibold text-fg">{name}</p>
                        <p className="truncate text-xs text-fg-subtle">{email}</p>
                        <span
                          className={`mt-2 ${isSuperAdmin ? 'badge-brand' : 'badge-neutral'}`}
                        >
                          {isSuperAdmin ? 'Super admin' : 'Institution admin'}
                        </span>
                      </div>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-on-danger transition-colors hover:bg-tint-danger"
                      >
                        <LogOut size={15} />
                        Sign out
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
};

export default AdminShell;
