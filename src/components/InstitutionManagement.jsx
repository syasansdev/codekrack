// src/components/InstitutionManagement.jsx
// Super-admin screen: add / edit / delete institutions. Creating an institution
// also provisions its admin login (email + password set here), via the backend.
// Guarded by SuperAdminRoute in App.jsx.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  useInstitutions,
  useCreateInstitution,
  useUpdateInstitution,
  useDeleteInstitution,
} from '../hooks/queries/useInstitutions';

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
        await createInstitution.mutateAsync(form);
        toast.success('Institution + admin login created');
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

  const handleDelete = async (inst) => {
    if (
      !window.confirm(
        `Delete "${inst.name}"?\n\nThis removes its admin login (${inst.adminEmail || 'none'}). ` +
          `Student records are KEPT but unlinked from this institution.`
      )
    )
      return;
    try {
      const res = await deleteInstitution.mutateAsync(inst.id);
      toast.success(
        `Institution deleted${res.unlinkedStudents ? ` — ${res.unlinkedStudents} student(s) unlinked` : ''}`
      );
    } catch (err) {
      toast.error(err.message || 'Delete failed');
    }
  };

  const inputCls =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none';

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <div className="mb-6">
        <button
          onClick={() => navigate('/admin/dashboard')}
          className="text-sm text-blue-600 hover:underline mb-2 inline-flex items-center gap-1"
        >
          ← Back to dashboard
        </button>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Institutions</h1>
        <p className="text-gray-600">
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
              <div className="mt-2 text-sm font-mono bg-white border border-green-200 rounded-md px-3 py-2 inline-block">
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
        <h2 className="text-lg font-semibold text-ink-900 mb-4">
          {editingId ? 'Edit institution' : 'Add a new institution'}
        </h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="SJCE"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Chennai, Tamil Nadu"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact email</label>
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              placeholder="office@college.edu"
              className={inputCls}
            />
          </div>

          {/* Admin login block */}
          <div className="md:col-span-2 border-t border-gray-100 pt-4 mt-1">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Institution admin login</h3>
            <p className="text-xs text-gray-500 mb-3">
              {editingId
                ? 'The login ID cannot be changed. Enter a new password only if you want to reset it.'
                : 'These are the credentials the institution admin will sign in with at /admin/signin.'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin name</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Admin login ID (email) {!editingId && <span className="text-red-500">*</span>}
            </label>
            <input
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              placeholder="admin@college.edu"
              className={`${inputCls} ${editingId ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              disabled={!!editingId}
              required={!editingId}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
        <div className="px-6 py-4 border-b border-ink-100 bg-brand-gradient-soft">
          <h2 className="text-lg font-semibold text-ink-900">
            All institutions ({institutions.length})
          </h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : institutions.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No institutions yet. Add your first one above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Name</th>
                  <th className="text-left px-6 py-3 font-medium">Code</th>
                  <th className="text-left px-6 py-3 font-medium">Admin login ID</th>
                  <th className="text-left px-6 py-3 font-medium">Students</th>
                  <th className="text-right px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {institutions.map((inst) => (
                  <tr key={inst.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-800">{inst.name}</div>
                      {inst.address && <div className="text-xs text-gray-500">{inst.address}</div>}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{inst.code || '—'}</td>
                    <td className="px-6 py-4 text-gray-600 font-mono text-xs">
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
