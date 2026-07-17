// src/components/AdminDashboard.jsx
//
// The admin / super-admin overview.
//
// Navigation lives in AdminShell now (mounted from AdminRoute), so this file is
// only the page. The previous version was ~1,290 lines, most of it an inline
// 288px sidebar that no other admin screen had, plus hand-written <svg> for
// every icon and a bespoke count-up hook.
//
// Every number here comes from ONE request. /api/dashboard/stats already
// aggregates in SQL and is already scope-correct: a super-admin's figures span
// every institution, an institution admin's are pinned to their own by the
// server regardless of what the client asks for.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Building2,
  ChevronRight,
  Gauge,
  RefreshCw,
  Target,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import useAdminScope from '../hooks/useAdminScope';
import { useDashboardStats } from '../hooks/queries/useDashboard';
import { useInstitutions } from '../hooks/queries/useInstitutions';
import StatCard from './ui/StatCard';
import Sparkline from './ui/Sparkline';

// Bar colours are each platform's own brand, which is what makes the rows
// scannable without reading the labels. GitHub's is monochrome, so it uses
// `fg-muted` — a fixed ink-500 was legible on white and nearly vanished against
// the dark track, making a 96%-complete platform look like it had done nothing.
const PLATFORM_META = {
  leetcode: { label: 'LeetCode', bar: 'bg-amber-500' },
  github: { label: 'GitHub', bar: 'bg-fg-muted' },
  codeforces: { label: 'Codeforces', bar: 'bg-brand-500' },
  atcoder: { label: 'AtCoder', bar: 'bg-emerald-500' },
};

/**
 * 'YYYY-MM-DD' -> 'Mon'.
 *
 * Built from parts rather than `new Date(iso)`: the string form is parsed as UTC
 * midnight, so east of Greenwich every label would render as the previous day.
 * The API zero-fills these server-side, so the series is always 7 long.
 */
const dayLabel = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short' });
};

/* ── Platform scrape health ───────────────────────────────────────────────── */
const PlatformHealth = ({ platforms, loading }) => {
  const rows = Object.entries(platforms || {});

  return (
    <div className="rounded-2xl border border-edge bg-surface p-5 shadow-elite">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-display text-base font-bold text-fg">Scrape health</h2>
          <p className="text-xs text-fg-subtle">Profiles successfully fetched, per platform</p>
        </div>
        <Gauge size={17} className="text-fg-subtle" />
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-surface-3" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-subtle">No platforms tracked yet.</p>
      ) : (
        <div className="space-y-4">
          {rows.map(([key, p]) => {
            const meta = PLATFORM_META[key] ?? { label: key, bar: 'bg-brand-500' };
            // Guard the divide: a platform with no students tracked has total 0,
            // and 0/0 is NaN — which renders as a bar of width "NaN%", i.e. none.
            const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
            return (
              <div key={key}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-fg">{meta.label}</span>
                  <span className="text-xs tabular-nums text-fg-subtle">
                    {p.completed}/{p.total}
                    {p.failed > 0 && (
                      <span className="ml-2 text-on-danger">{p.failed} failed</span>
                    )}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                  <motion.div
                    className={`h-full rounded-full ${meta.bar}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ── Per-institution breakdown (super-admin only) ─────────────────────────── */
const InstitutionBreakdown = ({ institutions, loading }) => {
  // Sort by size, biggest first. studentCount is a real number, not a string:
  // backend/config/db.js registers an INT8 type parser, so pg's bigint doesn't
  // arrive as text (which would sort "9" above "412").
  const rows = useMemo(
    () => [...(institutions || [])].sort((a, b) => (b.studentCount || 0) - (a.studentCount || 0)),
    [institutions]
  );
  const max = rows[0]?.studentCount || 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-edge bg-surface shadow-elite">
      <div className="flex items-center justify-between border-b border-edge px-5 py-4">
        <div>
          <h2 className="font-display text-base font-bold text-fg">Institutions</h2>
          <p className="text-xs text-fg-subtle">Students enrolled per institution</p>
        </div>
        <Link
          to="/admin/institutions"
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-500 hover:text-brand-600"
        >
          Manage <ChevronRight size={13} />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-3" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <Building2 size={22} className="mx-auto mb-2 text-fg-subtle" />
          <p className="text-sm font-medium text-fg">No institutions yet</p>
          <Link to="/admin/institutions" className="mt-3 inline-flex btn-accent">
            Create the first one
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-edge bg-surface-2">
                <th className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                  Institution
                </th>
                <th className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                  Admin
                </th>
                <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                  Students
                </th>
                <th className="w-32 px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((inst) => (
                <tr
                  key={inst.id}
                  className="border-b border-edge last:border-0 transition-colors hover:bg-surface-2"
                >
                  <td className="px-5 py-3">
                    <p className="text-sm font-semibold text-fg">{inst.name}</p>
                    {inst.code && <p className="text-xs text-fg-subtle">{inst.code}</p>}
                  </td>
                  <td className="px-5 py-3">
                    {/* adminEmail is derived by join. A null means the institution
                        has no admin account — worth surfacing, since nobody can
                        sign in to manage it. */}
                    {inst.adminEmail ? (
                      <p className="truncate text-xs text-fg-muted">{inst.adminEmail}</p>
                    ) : (
                      <span className="badge-warn">No admin</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-fg">
                    {(inst.studentCount || 0).toLocaleString()}
                  </td>
                  <td className="px-5 py-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <motion.div
                        className="h-full rounded-full bg-brand-gradient"
                        initial={{ width: 0 }}
                        animate={{
                          width: max > 0 ? `${((inst.studentCount || 0) / max) * 100}%` : '0%',
                        }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* ── Quick actions ────────────────────────────────────────────────────────── */
const QUICK = [
  { to: '/admin/add-student', label: 'Add student', hint: 'Invite by email', icon: UserPlus },
  { to: '/admin/leaderboard', label: 'Leaderboard', hint: 'Rank by platform', icon: TrendingUp },
  { to: '/admin/scraping-status', label: 'Scraping', hint: 'Live fetch status', icon: Activity },
  { to: '/admin/institutions', label: 'Institutions', hint: 'Manage colleges', icon: Building2, superOnly: true },
];

const QuickActions = ({ isSuperAdmin }) => (
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    {QUICK.filter((q) => !q.superOnly || isSuperAdmin).map((q) => {
      const Icon = q.icon;
      return (
        <Link
          key={q.to}
          to={q.to}
          // The old quick-action cards set `bg-white-100/50` — not a real
          // Tailwind class, so they rendered with no background at all against
          // the slate page. These use real tokens.
          className="group flex items-center gap-3 rounded-2xl border border-edge bg-surface p-4
                     shadow-elite transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elite-lg"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-tint-brand text-on-brand transition-transform group-hover:scale-105">
            <Icon size={16} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-fg">{q.label}</span>
            <span className="block truncate text-xs text-fg-subtle">{q.hint}</span>
          </span>
        </Link>
      );
    })}
  </div>
);

/* ── Page ─────────────────────────────────────────────────────────────────── */
const AdminDashboard = () => {
  const { isSuperAdmin, institutionId, institutionName } = useAdminScope();
  const { data, isLoading, isError, error, refetch, isFetching } = useDashboardStats({
    institutionId,
  });

  // Only a super-admin can see more than one institution, so only they need the
  // breakdown. `enabled` keeps an institution admin from firing a request whose
  // answer is always their own single row.
  const { data: institutions, isLoading: instLoading } = useInstitutions({
    enabled: isSuperAdmin,
  });

  const stats = data?.stats;

  // Memoised, not `data?.recentActivity ?? []` inline: the `?? []` allocates a
  // NEW array on every render while data is undefined, so it would never be
  // referentially equal and the three useMemos below would recompute every
  // render — defeating the point of memoising them at all.
  const activity = useMemo(() => data?.recentActivity ?? [], [data?.recentActivity]);

  const series = useMemo(() => activity.map((d) => Number(d.count) || 0), [activity]);
  const labels = useMemo(() => activity.map((d) => dayLabel(d.date)), [activity]);
  const weekTotal = useMemo(() => series.reduce((a, b) => a + b, 0), [series]);

  if (isError) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-edge bg-surface p-8 text-center shadow-elite">
        <AlertTriangle size={26} className="mx-auto mb-3 text-on-danger" />
        <h2 className="font-display text-lg font-bold text-fg">Couldn't load the dashboard</h2>
        <p className="mt-1 text-sm text-fg-muted">{error?.message || 'Something went wrong.'}</p>
        <button type="button" onClick={() => refetch()} className="btn-primary mt-5">
          <RefreshCw size={15} /> Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page intro. The title itself is in the shell's top bar; this says what
          the numbers below are counting, which changes with role. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-fg-muted">
            {isSuperAdmin ? (
              <>Everything across <span className="font-semibold text-fg">all institutions</span>.</>
            ) : (
              <>
                Your students at{' '}
                <span className="font-semibold text-fg">{institutionName || 'your institution'}</span>.
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-ghost !px-3 !py-2 text-xs"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : undefined} />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total students"
          value={stats?.totalStudents}
          delta={stats?.newThisWeek}
          icon={<Users size={18} />}
          tone="brand"
          loading={isLoading}
        />

        {/* Super-admins only. The API returns a literal 1 for an institution
            admin (they have exactly one), so showing it to them would be a tile
            that says "1" forever and teaches nothing. */}
        {isSuperAdmin && (
          <StatCard
            label="Total institutions"
            value={stats?.totalInstitutions}
            icon={<Building2 size={18} />}
            tone="accent"
            hint="Across the platform"
            loading={isLoading}
          />
        )}

        <StatCard
          label="Problems solved"
          value={stats?.totalSolvedProblems}
          icon={<Target size={18} />}
          tone="success"
          hint={`${(stats?.avgSolvedPerStudent ?? 0).toLocaleString()} avg per student`}
          loading={isLoading}
        />

        <StatCard
          label="Active this week"
          value={stats?.activeThisWeek}
          icon={<Activity size={18} />}
          tone="warn"
          hint="Signed in within 7 days"
          loading={isLoading}
        />

        {/* Keeps the grid at four across for an institution admin, who doesn't
            get the institutions tile. */}
        {!isSuperAdmin && (
          <StatCard
            label="Avg per student"
            value={stats?.avgSolvedPerStudent}
            icon={<Gauge size={18} />}
            tone="accent"
            hint="Problems solved"
            loading={isLoading}
          />
        )}
      </div>

      {/* Trend + scrape health */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* flex-col so the chart can absorb the leftover height. The grid row is
            as tall as the taller card next to it, and a fixed-height chart just
            left a slab of empty card under itself. */}
        <div className="flex flex-col rounded-2xl border border-edge bg-surface p-5 shadow-elite lg:col-span-2">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-fg">New students</h2>
              <p className="text-xs text-fg-subtle">Sign-ups over the last 7 days</p>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-bold tabular-nums text-fg">{weekTotal}</p>
              <p className="text-xs text-fg-subtle">this week</p>
            </div>
          </div>

          {isLoading ? (
            <div className="min-h-[7rem] flex-1 animate-pulse rounded-xl bg-surface-3" />
          ) : weekTotal === 0 ? (
            // A flat zero line looks like a broken chart. Say so instead.
            <div className="flex min-h-[7rem] flex-1 flex-col items-center justify-center rounded-xl bg-surface-2">
              <p className="text-sm font-medium text-fg">No sign-ups in the last 7 days</p>
              <Link to="/admin/add-student" className="mt-2 text-xs font-semibold text-brand-500 hover:text-brand-600">
                Add a student →
              </Link>
            </div>
          ) : (
            // text-brand-500 is what colours the chart: Sparkline draws with
            // currentColor, so it follows the theme without knowing about it.
            <Sparkline data={series} labels={labels} className="min-h-[7rem] flex-1 text-brand-500" />
          )}
        </div>

        <PlatformHealth platforms={stats?.platforms} loading={isLoading} />
      </div>

      {/* Per-institution breakdown — the whole point of the super-admin view */}
      {isSuperAdmin && (
        <InstitutionBreakdown institutions={institutions} loading={instLoading} />
      )}

      <div>
        <h2 className="mb-3 font-display text-base font-bold text-fg">Quick actions</h2>
        <QuickActions isSuperAdmin={isSuperAdmin} />
      </div>
    </div>
  );
};

export default AdminDashboard;
