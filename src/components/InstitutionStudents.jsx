// src/components/InstitutionStudents.jsx
//
// The roster that opens inline underneath an institution row.
//
// WHY A TABLE AND NOT CARDS. A card per student answers "tell me about Arun".
// The question this screen is actually for is "how is this college doing" —
// which is a comparison across students, and comparison needs the same number in
// the same column on every row. Cards put Arun's LeetCode count in a different
// place on screen from Priya's, so the eye cannot scan them, and a cohort of 60
// becomes 60 screens of scrolling.
//
// This also absorbed what the old Student Access page did. That page was a
// second, parallel way to reach students — a separate list, its own search, its
// own actions — kept in sync with this one by hand. The account actions now live
// on the row of the student they act on, which is where someone is already
// looking when they decide to use one.
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2 } from 'lucide-react';
import { useStudents, useSendInvite, useSetStudentPassword, useSetStudentStatus } from '../hooks/queries/useStudents';

// One page of rows. 25 keeps the expanded roster shorter than the institutions
// table it sits inside, so the page does not visually swallow the row above it.
const PAGE_SIZE = 25;

// The platform columns, in board order. Only the UNIT differs per platform —
// GitHub counts repositories, everything else counts problems — because the
// number itself comes from platform_stats.metric, which the server has already
// resolved per platform. No key-picking out of the jsonb payload happens here.
const BOARDS = [
  { id: 'leetcode', label: 'LeetCode', unit: 'solved' },
  { id: 'github', label: 'GitHub', unit: 'repos' },
  { id: 'codeforces', label: 'Codeforces', unit: 'solved' },
  { id: 'atcoder', label: 'AtCoder', unit: 'solved' },
  { id: 'hackerrank', label: 'HackerRank', unit: 'solved' },
];

/**
 * What to show in a platform cell.
 *
 * FOUR states, and they must stay distinguishable — each one calls for a
 * different action, and collapsing any two of them into "0" hides the one thing
 * the cell is there to tell you:
 *
 *   "—"       no profile link. Ask the student for their handle.
 *   "…"       link on file, not scraped yet. Wait for the next run.
 *   "failed"  we tried and could not read it. The handle is probably wrong.
 *   0         scraped successfully; they have genuinely solved nothing.
 *
 * The number comes from platform_stats.metric (serialised as platformMetrics),
 * not from digging a per-platform key out of the jsonb payload. That is the
 * same column the leaderboard sorts on, so this table and the board cannot
 * disagree — and a completed scrape that reported no payload still reads 0
 * rather than falling through to "—".
 */
const platformCell = (student, board) => {
  const url = student.platformUrls?.[board.id];
  if (!url) return { text: '—', tone: 'text-fg-subtle', title: 'No profile link on file' };

  const status = student.scrapingStatus?.[board.id];
  if (status === 'failed') {
    return { text: 'failed', tone: 'text-red-600', title: 'The last scrape of this profile failed' };
  }
  if (status !== 'completed') {
    return { text: '…', tone: 'text-fg-subtle', title: 'Queued for the next scraper run' };
  }

  const value = student.platformMetrics?.[board.id] ?? 0;
  return {
    text: `${Number(value).toLocaleString()} ${board.unit}`,
    tone: value === 0 ? 'text-fg-muted' : 'text-fg',
    title: `${board.label}: ${value} ${board.unit} (last successful scrape)`,
  };
};

/**
 * Three states, in priority order:
 *
 *   Deactivated  the login is banned; nothing else about the row matters.
 *   Invited      admin-created, sent a set-password link (invitedAt stamped).
 *   Registered   self-registered — chose their own password, never invited.
 *
 * Same vocabulary as the Manage students screen, deliberately: two screens
 * describing the same account with different words is how support calls start.
 */
const StatusPill = ({ student }) => {
  const [label, cls] = !student.isActive
    ? ['Deactivated', 'bg-gray-100 text-gray-600 ring-gray-500/20']
    : student.invitedAt
      ? ['Invited', 'bg-blue-50 text-blue-700 ring-blue-600/20']
      : ['Registered', 'bg-green-50 text-green-700 ring-green-600/20'];

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  );
};

const InstitutionStudents = ({ institution, onViewStudent }) => {
  // enabled is implicit: this component only mounts when its row is expanded, so
  // a collapsed institution costs no request. React Query caches per
  // institutionId, so re-opening one is instant.
  const { data: students = [], isLoading, error } = useStudents({
    institutionId: institution.id,
  });

  const sendInvite = useSendInvite();
  const setPassword = useSetStudentPassword();
  const setStatus = useSetStudentStatus();

  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [pwFor, setPwFor] = useState(null);
  const [pwValue, setPwValue] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.rollNumber?.toLowerCase().includes(q) ||
        s.registerNumber?.toLowerCase().includes(q) ||
        s.department?.toLowerCase().includes(q)
    );
  }, [students, search]);

  // Paginate rather than virtualise. Each row here is 11 cells with three
  // buttons; a 2,000-student college would otherwise mount ~22,000 cells and
  // 6,000 handlers inside a row that is already nested in another table, which
  // janks the whole institutions page on expand. Pagination is also the pattern
  // this codebase already uses (AdminLeaderboard), so it needs no new
  // dependency and behaves the way the rest of the admin area does.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  // Typing a search while on page 7 must not leave you looking at an empty
  // page 7 of 2 results.
  useEffect(() => {
    setPage(1);
  }, [search, institution.id]);

  const run = async (id, fn, successMessage) => {
    setBusyId(id);
    try {
      await fn();
      toast.success(successMessage);
    } catch (e) {
      toast.error(e.message || 'That did not work');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = (student) => {
    const next = !student.isActive;
    if (
      !next &&
      !window.confirm(
        `Deactivate ${student.name || student.email}? They will not be able to sign in. ` +
          'Nothing is deleted — their profile and scraped history stay, and reactivating restores access.'
      )
    ) {
      return;
    }
    run(
      student.id,
      () => setStatus.mutateAsync({ id: student.id, active: next }),
      next ? `${student.email} can sign in again` : `${student.email} has been deactivated`
    );
  };

  const handleSetPassword = (student) => {
    const value = pwValue.trim();
    if (value.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    run(
      student.id,
      async () => {
        await setPassword.mutateAsync({ id: student.id, password: value });
        setPwFor(null);
        setPwValue('');
      },
      `Password set for ${student.email}. Their sessions were revoked — hand it over directly.`
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-6 py-8 text-sm text-fg-subtle">
        <Loader2 size={16} className="animate-spin" />
        Loading students…
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-6 text-sm text-red-600">
        Could not load students for this institution: {error.message}
      </div>
    );
  }

  if (!students.length) {
    return (
      <div className="px-6 py-8 text-sm text-fg-subtle">
        No students yet. They appear here as soon as someone registers under{' '}
        <span className="font-medium text-fg">{institution.name}</span>.
      </div>
    );
  }

  return (
    <div className="px-4 py-4 sm:px-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-fg">
          Students in {institution.name}{' '}
          <span className="font-normal text-fg-subtle">
            ({filtered.length}
            {filtered.length !== students.length ? ` of ${students.length}` : ''})
          </span>
        </h3>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, roll number…"
          className="w-full sm:w-72 px-3 py-1.5 text-sm border border-edge-strong rounded-lg
                     focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
        />
      </div>

      {/* The table scrolls inside this box rather than widening the page — with
          five platform columns it is wider than a laptop screen. */}
      <div className="overflow-x-auto rounded-lg border border-edge">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-fg-muted">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap">Name</th>
              <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap">Email</th>
              <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap">Dept · Year</th>
              {BOARDS.map((b) => (
                <th key={b.id} className="text-left px-4 py-2.5 font-medium whitespace-nowrap">
                  {b.label}
                </th>
              ))}
              <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap">Total</th>
              <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap">Status</th>
              <th className="text-right px-4 py-2.5 font-medium whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {pageRows.map((s) => (
              <tr key={s.id} className={`hover:bg-surface-2 ${s.isActive ? '' : 'opacity-60'}`}>
                <td className="px-4 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => onViewStudent?.(s)}
                    className="font-medium text-fg hover:text-blue-600 hover:underline text-left"
                  >
                    {s.name || '—'}
                  </button>
                  {s.rollNumber && (
                    <div className="text-xs text-fg-subtle">{s.rollNumber}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-fg-muted whitespace-nowrap">{s.email}</td>
                <td className="px-4 py-3 text-fg-muted whitespace-nowrap">
                  {[s.department, s.year && `Year ${s.year}`].filter(Boolean).join(' · ') || '—'}
                </td>

                {BOARDS.map((b) => {
                  const cell = platformCell(s, b);
                  return (
                    <td
                      key={b.id}
                      className={`px-4 py-3 whitespace-nowrap ${cell.tone}`}
                      title={cell.title}
                    >
                      {cell.text}
                    </td>
                  );
                })}

                <td className="px-4 py-3 whitespace-nowrap font-semibold text-fg">
                  {(s.totalSolved ?? 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusPill student={s} />
                </td>

                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() =>
                        run(
                          s.id,
                          () => sendInvite.mutateAsync(s.id),
                          `Set-password email sent to ${s.email}`
                        )
                      }
                      disabled={busyId === s.id}
                      title="Email this student a link to set a new password. Does not change their current one."
                      className="px-2.5 py-1 rounded-md text-blue-600 hover:bg-blue-50 font-medium disabled:opacity-40"
                    >
                      Reset link
                    </button>
                    <button
                      onClick={() => {
                        setPwFor(pwFor === s.id ? null : s.id);
                        setPwValue('');
                      }}
                      className="px-2.5 py-1 rounded-md text-fg-muted hover:bg-surface-3 font-medium"
                    >
                      {pwFor === s.id ? 'Cancel' : 'Set password'}
                    </button>
                    <button
                      onClick={() => handleToggleActive(s)}
                      disabled={busyId === s.id}
                      className={`px-2.5 py-1 rounded-md font-medium disabled:opacity-40 ${
                        s.isActive
                          ? 'text-red-600 hover:bg-red-50'
                          : 'text-emerald-600 hover:bg-emerald-50'
                      }`}
                    >
                      {s.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>

                  {pwFor === s.id && (
                    <div className="mt-2 flex justify-end gap-2">
                      <input
                        type="password"
                        value={pwValue}
                        onChange={(e) => setPwValue(e.target.value)}
                        placeholder="New password (min 8)"
                        autoComplete="new-password"
                        className="px-2.5 py-1 text-sm border border-edge-strong rounded-md
                                   focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                      />
                      <button
                        onClick={() => handleSetPassword(s)}
                        disabled={busyId === s.id}
                        className="px-3 py-1 rounded-md bg-orange-500 text-white font-medium disabled:opacity-40"
                      >
                        Set
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-fg-subtle">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of{' '}
            {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((n) => Math.max(1, n - 1))}
              disabled={safePage === 1}
              className="px-3 py-1 text-sm rounded-md border border-edge-strong text-fg-muted
                         hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-xs text-fg-subtle">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((n) => Math.min(totalPages, n + 1))}
              disabled={safePage === totalPages}
              className="px-3 py-1 text-sm rounded-md border border-edge-strong text-fg-muted
                         hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <p className="mt-2 text-xs text-fg-subtle">
        “—” no profile link · “…” queued for the next scrape · “failed” the last scrape could not
        read the profile · a number is the last successful scrape, so <strong>0</strong> means zero
        solved. Nobody — including you — can read an existing password; “Set password” replaces one.
      </p>
    </div>
  );
};

export default InstitutionStudents;
