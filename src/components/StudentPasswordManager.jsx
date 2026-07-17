// src/components/StudentPasswordManager.jsx  →  "Student Access"
//
// This screen used to be a list of every student's password in plaintext, with
// buttons to copy them, export them to CSV and mail them around. It was the
// natural consequence of storing passwords: once you have them, someone builds
// a table for them.
//
// We don't have them any more. Accounts are created with a value nobody knows,
// and students set their own password through an emailed link. So the useful
// question changed from "what is their password?" to "can they get in?", and
// this screen answers that instead:
//
//   never invited  — created, but the email never went out (usually an SMTP fail)
//   invited        — email sent, they haven't signed in yet
//   active         — they've set a password and signed in
//
// Institution admin logins are still set by the super-admin (a deliberate
// product decision), so that section stays — but note it can only SET a
// password, never reveal one. Nothing here can show you an existing password,
// because nothing anywhere knows it.
import { useState, useEffect, useMemo } from 'react';
import { useAdminScope } from '../hooks/useAdminScope';
import { useStudentAccess, useSendInvite } from '../hooks/queries/useStudents';
import { useInstitutions, useUpdateInstitution } from '../hooks/queries/useInstitutions';

const timeAgo = (iso) => {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

const STATE_STYLES = {
  active: { label: 'Active', cls: 'bg-green-50 text-green-700 ring-green-600/20' },
  invited: { label: 'Invited', cls: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
  never_invited: { label: 'No invite sent', cls: 'bg-red-50 text-red-700 ring-red-600/20' },
};

const StatusPill = ({ state }) => {
  const s = STATE_STYLES[state] || STATE_STYLES.never_invited;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.cls}`}>
      {s.label}
    </span>
  );
};

const StudentPasswordManager = () => {
  const { institutionId, isSuperAdmin } = useAdminScope();
  const { data, isLoading, isFetching, refetch } = useStudentAccess({ institutionId });
  const sendInvite = useSendInvite();

  const [searchTerm, setSearchTerm] = useState('');
  const [sendingId, setSendingId] = useState(null);
  const [bulkSending, setBulkSending] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Institution admin logins (super-admin only)
  const { data: institutions = [] } = useInstitutions({ enabled: isSuperAdmin });
  const updateInstitution = useUpdateInstitution();
  const [adminPwInput, setAdminPwInput] = useState({});
  const [resettingAdminId, setResettingAdminId] = useState(null);

  const students = data?.students || [];
  const adminAccounts = data?.admins || [];

  useEffect(() => {
    if (!message.text) return undefined;
    const t = setTimeout(() => setMessage({ type: '', text: '' }), 8000);
    return () => clearTimeout(t);
  }, [message]);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.rollNumber?.toLowerCase().includes(q) ||
        s.department?.toLowerCase().includes(q)
    );
  }, [students, searchTerm]);

  const stats = useMemo(
    () => ({
      total: students.length,
      active: students.filter((s) => s.accessState === 'active').length,
      invited: students.filter((s) => s.accessState === 'invited').length,
      never: students.filter((s) => s.accessState === 'never_invited').length,
    }),
    [students]
  );

  const handleSend = async (student) => {
    setSendingId(student.id);
    try {
      await sendInvite.mutateAsync(student.id);
      setMessage({ type: 'success', text: `Set-password email sent to ${student.email}` });
    } catch (e) {
      setMessage({ type: 'error', text: `Could not send to ${student.email}: ${e.message}` });
    } finally {
      setSendingId(null);
    }
  };

  // Chase everyone who can't get in yet. Deliberately excludes 'active'
  // students: mailing a reset link to someone who is already signed in and
  // happy is confusing at best and looks like a phishing attempt at worst.
  const handleSendAllPending = async () => {
    const targets = students.filter((s) => s.accessState !== 'active');
    if (!targets.length) {
      setMessage({ type: 'success', text: 'Everyone has already signed in — nothing to send.' });
      return;
    }
    setBulkSending(true);
    let sent = 0;
    let failed = 0;
    for (const s of targets) {
      try {
        await sendInvite.mutateAsync(s.id);
        sent++;
      } catch {
        failed++;
      }
    }
    setBulkSending(false);
    setMessage({
      type: failed ? 'error' : 'success',
      text: `Sent ${sent} invite${sent === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}.`,
    });
  };

  const handleAdminPasswordReset = async (inst) => {
    const newPassword = (adminPwInput[inst.id] || '').trim();
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'New password must be at least 8 characters' });
      return;
    }
    setResettingAdminId(inst.id);
    try {
      await updateInstitution.mutateAsync({ id: inst.id, adminPassword: newPassword });
      setAdminPwInput((p) => ({ ...p, [inst.id]: '' }));
      setMessage({
        type: 'success',
        text: `Password set for ${inst.adminEmail}. Their existing sessions were revoked — hand them the new password directly.`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to set admin password' });
    } finally {
      setResettingAdminId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="h-12 w-12 rounded-full border-[3px] border-blue-100 border-t-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-fg">Student Access</h1>
          <p className="text-fg-subtle mt-1 max-w-2xl">
            Students set their own passwords through an emailed link. Nobody — including you — can
            see a student&apos;s password, so this shows whether they can sign in instead.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} disabled={isFetching} className="btn-ghost">
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            onClick={handleSendAllPending}
            disabled={bulkSending || stats.total === stats.active}
            className="btn-accent"
          >
            {bulkSending ? 'Sending…' : `Email everyone who hasn't signed in (${stats.total - stats.active})`}
          </button>
        </div>
      </div>

      {message.text && (
        <div
          role="alert"
          className={`mb-5 rounded-xl border p-3 text-sm ${
            message.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-green-200 bg-green-50 text-green-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Students', value: stats.total, cls: 'text-fg' },
          { label: 'Signed in', value: stats.active, cls: 'text-green-600' },
          { label: 'Invited, waiting', value: stats.invited, cls: 'text-blue-600' },
          { label: 'No invite sent', value: stats.never, cls: 'text-red-600' },
        ].map((s) => (
          <div key={s.label} className="card-elite p-4">
            <div className={`text-2xl font-bold ${s.cls}`}>{s.value}</div>
            <div className="text-xs font-medium text-fg-subtle mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {stats.never > 0 && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <strong>{stats.never}</strong> student{stats.never === 1 ? ' has' : 's have'} never received an
          invite — usually the email failed to send when they were created. They cannot sign in until
          one arrives.
        </div>
      )}

      {/* Students */}
      <div className="card-elite overflow-hidden mb-8">
        <div className="p-4 border-b border-edge">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, email, roll number or department…"
            className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th className="text-left">Student</th>
                <th className="text-left">Status</th>
                <th className="text-left">Invite sent</th>
                <th className="text-left">Last sign-in</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="font-medium text-fg">{s.name}</div>
                    <div className="text-xs text-fg-subtle">{s.email}</div>
                    {s.rollNumber && <div className="text-xs text-fg-subtle">{s.rollNumber}</div>}
                  </td>
                  <td><StatusPill state={s.accessState} /></td>
                  <td className="text-sm text-fg-subtle">{timeAgo(s.invitedAt) || '—'}</td>
                  <td className="text-sm text-fg-subtle">{timeAgo(s.lastSignInAt) || 'Never'}</td>
                  <td className="text-right">
                    <button
                      onClick={() => handleSend(s)}
                      disabled={sendingId === s.id || bulkSending}
                      className="btn-ghost text-sm"
                    >
                      {sendingId === s.id
                        ? 'Sending…'
                        : s.accessState === 'active'
                          ? 'Send reset link'
                          : 'Send invite'}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-fg-subtle">
                    {students.length === 0 ? 'No students yet.' : 'No students match that search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Institution admin logins — super-admin only */}
      {isSuperAdmin && (
        <div className="card-elite overflow-hidden">
          <div className="p-4 border-b border-edge">
            <h2 className="font-display text-lg font-semibold text-fg">Institution admin logins</h2>
            <p className="text-sm text-fg-subtle mt-1">
              You set these passwords directly and hand them over. They are never stored, so this can
              set a new one but can&apos;t show you an existing one.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th className="text-left">Institution</th>
                  <th className="text-left">Login ID</th>
                  <th className="text-left">Last sign-in</th>
                  <th className="text-left">Set a new password</th>
                </tr>
              </thead>
              <tbody>
                {institutions.map((inst) => {
                  const acct = adminAccounts.find((a) => a.institutionId === inst.id);
                  return (
                    <tr key={inst.id}>
                      <td className="font-medium text-fg">{inst.name}</td>
                      <td className="text-sm text-fg-muted">{inst.adminEmail || <span className="text-fg-subtle">no admin</span>}</td>
                      <td className="text-sm text-fg-subtle">
                        {acct ? timeAgo(acct.lastSignInAt) || 'Never' : '—'}
                      </td>
                      <td>
                        {inst.adminEmail ? (
                          <div className="flex gap-2">
                            <input
                              type="password"
                              value={adminPwInput[inst.id] || ''}
                              onChange={(e) =>
                                setAdminPwInput((p) => ({ ...p, [inst.id]: e.target.value }))
                              }
                              placeholder="At least 8 characters"
                              className="px-3 py-1.5 text-sm border border-edge-strong rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                            />
                            <button
                              onClick={() => handleAdminPasswordReset(inst)}
                              disabled={resettingAdminId === inst.id || !(adminPwInput[inst.id] || '').trim()}
                              className="btn-ghost text-sm whitespace-nowrap"
                            >
                              {resettingAdminId === inst.id ? 'Setting…' : 'Set'}
                            </button>
                          </div>
                        ) : (
                          <span className="text-sm text-fg-subtle">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {institutions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-fg-subtle">
                      No institutions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentPasswordManager;
