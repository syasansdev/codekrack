// src/components/InstitutionManagement.jsx
// Super-admin screen: add / edit / delete institutions. Creating an institution
// also provisions its admin login (email + password set here), via the backend.
// Guarded by SuperAdminRoute in App.jsx.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { Download, Loader2 } from 'lucide-react';
import {
  useInstitutions,
  useCreateInstitution,
  useUpdateInstitution,
  useDeleteInstitution,
} from '../hooks/queries/useInstitutions';
import { studentsApi } from '../services/api';
import { exportToExcel, buildInstitutionStudentRows } from '../utils/excelExport';

const emptyForm = {
  name: '',
  code: '',
  address: '',
  contactEmail: '',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
};

const InstitutionManagement = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [createdCreds, setCreatedCreds] = useState(null);
  // Which institution's export is in flight — the students are fetched on demand
  // (the list here only carries a COUNT, not the roster), so the button shows a
  // spinner while that request runs.
  const [exportingId, setExportingId] = useState(null);

  // Student counts come from the institutions endpoint (a COUNT in SQL). The old
  // code called getAllStudents() — fetching EVERY student in the system to the
  // browser — purely to tally them per institution in a forEach.
  const { data: institutions = [], isLoading: loading, error: listError } = useInstitutions();
  const createInstitution = useCreateInstitution();
  const updateInstitution = useUpdateInstitution();
  const deleteInstitution = useDeleteInstitution();

  const saving = createInstitution.isPending || updateInstitution.isPending;

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error('Institution name is required');
      return;
    }

    // The code is required now, and it is not bureaucracy: it is the institution's
    // identity. Removing an institution archives it, and re-adding it matches on
    // this code to restore that exact row — which is what brings its students
    // back. An institution created without a code could never be restored.
    // The server enforces this too (and the DB has a CHECK constraint); this
    // check exists so the error lands next to the field instead of as a toast
    // after a round trip.
    if (!form.code.trim()) {
      toast.error('Institution code is required — it identifies this institution if it is ever removed and re-added');
      return;
    }

    // 8, not 6 — the server enforces a minimum of 8, so a 6-character password
    // would pass this check and then be rejected by the API. Keep them in step.
    if (!editingId) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail)) {
        toast.error('A valid admin email (login ID) is required');
        return;
      }
      if (form.adminPassword.length < 8) {
        toast.error('Admin password must be at least 8 characters');
        return;
      }
    } else if (form.adminPassword && form.adminPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }

    try {
      if (editingId) {
        await updateInstitution.mutateAsync({
          id: editingId,
          name: form.name,
          code: form.code,
          address: form.address,
          contactEmail: form.contactEmail,
          ...(form.adminPassword ? { adminPassword: form.adminPassword } : {}),
        });
        toast.success(
          form.adminPassword ? 'Institution updated + admin password reset' : 'Institution updated'
        );
      } else {
        const res = await createInstitution.mutateAsync(form);
        // A matching code restores an archived institution rather than creating
        // a new one, and its students come back with it. Say so plainly and
        // hold the toast longer — quietly re-adopting several hundred students
        // is not something to discover by accident later.
        if (res?.restored) {
          toast.success(
            `Restored "${form.name}" from the archive — ${res.reclaimedStudents} student(s) reclaimed`,
            { autoClose: 8000 }
          );
        } else {
          toast.success('Institution + admin login created');
        }
        // Shown once so the super-admin can hand the credentials over. This is
        // the only place the password appears — we don't store it anywhere.
        setCreatedCreds({ email: form.adminEmail, password: form.adminPassword });
      }
      resetForm();
      // No load() — the mutation hooks invalidate the institutions query, so the
      // list refetches itself.
    } catch (err) {
      toast.error(err.message || 'Something went wrong');
    }
  };

  const handleEdit = (inst) => {
    setEditingId(inst.id);
    setCreatedCreds(null);
    setForm({
      name: inst.name || '',
      code: inst.code || '',
      address: inst.address || '',
      contactEmail: inst.contactEmail || '',
      adminName: '',
      adminEmail: inst.adminEmail || '',
      adminPassword: '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExport = async (inst) => {
    if (exportingId) return; // one at a time
    setExportingId(inst.id);
    try {
      // The roster isn't in the institutions list (that's a COUNT only), so
      // fetch it now. As a super-admin, institutionId is honoured server-side.
      const students = await studentsApi.list({ institutionId: inst.id });
      if (!students?.length) {
        toast.info(`${inst.name} has no students to export`);
        return;
      }
      const rows = buildInstitutionStudentRows(students);
      // A filesystem-safe base name from the code (or the name as a fallback);
      // exportToExcel appends the date and the .xlsx extension.
      const base =
        (inst.code || inst.name || 'institution').replace(/[^a-z0-9]+/gi, '-').toLowerCase() +
        '-students';
      exportToExcel(rows, base);
      toast.success(`Exported ${rows.length} student(s) from ${inst.name}`);
    } catch (e) {
      toast.error(`Export failed: ${e.message}`);
    } finally {
      setExportingId(null);
    }
  };

  const handleDelete = async (inst) => {
    // This dialog used to promise "Student records are KEPT but unlinked from
    // this institution" — accurate at the time, and the reason 3 students on
    // this database ended up stranded: unlinking is unrecoverable, because
    // nothing records where they were. Removing now ARCHIVES, so the wording
    // has to describe what actually happens, including how to undo it.
    const count = inst.studentCount || 0;
    if (
      !window.confirm(
        `Remove "${inst.name}"?\n\n` +
          `• It disappears from every list and count.\n` +
          `• Its admin login (${inst.adminEmail || 'none'}) is deleted.\n` +
          `• Its ${count} student(s) KEEP their link to it — nothing is unlinked.\n\n` +
          `To bring it back, add an institution with the code "${inst.code}" again ` +
          `and its students return automatically.`
      )
    )
      return;
    try {
      const res = await deleteInstitution.mutateAsync(inst.id);
      toast.success(
        `"${inst.name}" archived` +
          (res.retainedStudents
            ? ` — ${res.retainedStudents} student(s) kept. Re-add code "${res.code}" to restore.`
            : ''),
        { autoClose: 8000 }
      );
    } catch (err) {
      toast.error(err.message || 'Remove failed');
    }
  };

  const inputCls =
    'w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none';

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <div className="mb-6">
        <button
          onClick={() => navigate('/admin/dashboard')}
          className="text-sm text-blue-600 hover:underline mb-2 inline-flex items-center gap-1"
        >
          ← Back to dashboard
        </button>
        <h1 className="text-2xl md:text-3xl font-bold text-fg">Institutions</h1>
        <p className="text-fg-muted">
          Add an institution and its admin login. That admin can sign in and will only see their
          own institution's students.
        </p>
      </div>

      {/* Newly created credentials */}
      {createdCreds && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-green-800 mb-1">Admin login created</p>
              <p className="text-sm text-green-700">
                Share these with the institution — the password is not recoverable later (you can
                only reset it).
              </p>
              <div className="mt-2 text-sm font-mono bg-surface border border-green-200 rounded-md px-3 py-2 inline-block">
                <div>ID: {createdCreds.email}</div>
                <div>Password: {createdCreds.password}</div>
              </div>
            </div>
            <button
              onClick={() => setCreatedCreds(null)}
              className="text-green-700 hover:text-green-900 text-sm"
            >
              Dismiss
            </button>
          </div>
        </motion.div>
      )}

      {/* Add / Edit form */}
      <div className="card-elite p-6 mb-8">
        <h2 className="text-lg font-semibold text-fg mb-4">
          {editingId ? 'Edit institution' : 'Add a new institution'}
        </h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="St. Joseph's College of Engineering"
              className={inputCls}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-1">
              Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="SJCE"
              className={inputCls}
              required
            />
            {/* Required as of the archive/restore change: this code is what a
                re-add matches to reclaim an institution's students, so an
                institution without one could never be restored. */}
            <p className="mt-1 text-xs text-fg-subtle">
              {editingId
                ? 'Changing this changes what must be typed to restore this institution later.'
                : 'Unique. Re-adding this code later restores this institution and its students.'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-1">Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Chennai, Tamil Nadu"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-1">Contact email</label>
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              placeholder="office@college.edu"
              className={inputCls}
            />
          </div>

          {/* Admin login block */}
          <div className="md:col-span-2 border-t border-edge pt-4 mt-1">
            <h3 className="text-sm font-semibold text-fg mb-1">Institution admin login</h3>
            <p className="text-xs text-fg-subtle mb-3">
              {editingId
                ? 'The login ID cannot be changed. Enter a new password only if you want to reset it.'
                : 'These are the credentials the institution admin will sign in with at /admin/signin.'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-1">Admin name</label>
            <input
              type="text"
              value={form.adminName}
              onChange={(e) => setForm({ ...form, adminName: e.target.value })}
              placeholder="Dr. R. Kumar"
              className={inputCls}
              disabled={!!editingId}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-1">
              Admin login ID (email) {!editingId && <span className="text-red-500">*</span>}
            </label>
            <input
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              placeholder="admin@college.edu"
              className={`${inputCls} ${editingId ? 'bg-surface-2 cursor-not-allowed' : ''}`}
              disabled={!!editingId}
              required={!editingId}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-1">
              {editingId ? 'New password (optional)' : 'Admin password'}{' '}
              {!editingId && <span className="text-red-500">*</span>}
            </label>
            <input
              type="text"
              value={form.adminPassword}
              onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
              placeholder={editingId ? 'Leave blank to keep current' : 'At least 6 characters'}
              className={inputCls}
              required={!editingId}
            />
          </div>

          <div className="md:col-span-2 flex gap-3">
            <motion.button
              type="submit"
              disabled={saving}
              whileHover={{ scale: saving ? 1 : 1.03 }}
              whileTap={{ scale: saving ? 1 : 0.97 }}
              className="btn-accent"
            >
              {saving ? 'Saving…' : editingId ? 'Update institution' : 'Add institution'}
            </motion.button>
            {editingId && (
              <button type="button" onClick={resetForm} className="btn-ghost">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* List */}
      <div className="card-elite overflow-hidden">
        <div className="px-6 py-4 border-b border-edge bg-brand-gradient-soft">
          <h2 className="text-lg font-semibold text-fg">
            All institutions ({institutions.length})
          </h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : institutions.length === 0 ? (
          <div className="text-center py-12 text-fg-subtle">
            No institutions yet. Add your first one above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-fg-muted">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Name</th>
                  <th className="text-left px-6 py-3 font-medium">Code</th>
                  <th className="text-left px-6 py-3 font-medium">Admin login ID</th>
                  <th className="text-left px-6 py-3 font-medium">Students</th>
                  <th className="text-right px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {institutions.map((inst) => (
                  <tr key={inst.id} className="hover:bg-surface-2">
                    <td className="px-6 py-4">
                      <div className="font-medium text-fg">{inst.name}</div>
                      {inst.address && <div className="text-xs text-fg-subtle">{inst.address}</div>}
                    </td>
                    <td className="px-6 py-4 text-fg-muted">{inst.code || '—'}</td>
                    <td className="px-6 py-4 text-fg-muted font-mono text-xs">
                      {inst.adminEmail || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        {inst.studentCount || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleExport(inst)}
                          disabled={exportingId === inst.id || !(inst.studentCount > 0)}
                          title={
                            inst.studentCount > 0
                              ? `Download all ${inst.studentCount} student(s) as Excel`
                              : 'No students to export'
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium
                                     text-emerald-600 hover:bg-emerald-50
                                     disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          {exportingId === inst.id ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <Download size={15} />
                          )}
                          {exportingId === inst.id ? 'Exporting…' : 'Excel'}
                        </button>
                        <button
                          onClick={() => handleEdit(inst)}
                          className="px-3 py-1.5 rounded-md text-blue-600 hover:bg-blue-50 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(inst)}
                          className="px-3 py-1.5 rounded-md text-red-600 hover:bg-red-50 font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default InstitutionManagement;
