// src/components/InstitutionManagement.jsx
// Super-admin screen: add / edit / delete institutions. Creating an institution
// also provisions its admin login (email + password set here), via the backend.
// Guarded by SuperAdminRoute in App.jsx.
import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react';
import {
  useInstitutions,
  useCreateInstitution,
  useUpdateInstitution,
  useDeleteInstitution,
} from '../hooks/queries/useInstitutions';
import { studentsApi } from '../services/api';
import { exportToExcel, buildInstitutionStudentRows } from '../utils/excelExport';
import { supabase } from '../lib/supabase';
import InstitutionStudents from './InstitutionStudents';
import StudentViewDetails from './StudentViewDetails';

const DELETE_SECRET_CODE = 'yoGi2290#!';
const INSTITUTION_LOGO_BUCKET = 'institution-logos';

const emptyForm = {
  name: '',
  code: '',
  address: '',
  contactEmail: '',
  logoUrl: '',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
};

const InstitutionManagement = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [createdCreds, setCreatedCreds] = useState(null);
  const [selectedLogoFile, setSelectedLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  // Which institution's export is in flight — the students are fetched on demand
  // (the list here only carries a COUNT, not the roster), so the button shows a
  // spinner while that request runs.
  const [exportingId, setExportingId] = useState(null);

  // Which institution's roster is open. One at a time, not a Set: two open
  // rosters means two tables of different widths stacked on one screen, and the
  // columns stop lining up — which is the whole reason this is a table.
  const [expandedId, setExpandedId] = useState(null);
  const [viewingStudent, setViewingStudent] = useState(null);

  // Student counts come from the institutions endpoint (a COUNT in SQL). The old
  // code called getAllStudents() — fetching EVERY student in the system to the
  // browser — purely to tally them per institution in a forEach.
  const { data: institutions = [], isLoading: loading, error: listError } = useInstitutions();
  const createInstitution = useCreateInstitution();
  const hasInstitutionError = Boolean(listError);
  const updateInstitution = useUpdateInstitution();
  const deleteInstitution = useDeleteInstitution();

  const saving = createInstitution.isPending || updateInstitution.isPending;

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setSelectedLogoFile(null);
    setLogoPreview('');
  };

  const uploadInstitutionLogo = async (file) => {
    if (!file) return '';
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${INSTITUTION_LOGO_BUCKET}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;
    const { data, error } = await supabase.storage.from(INSTITUTION_LOGO_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: true,
    });
    if (error) {
      if (/(bucket.*not found|not found)/i.test(error.message)) {
        throw new Error(
          `Image upload is not configured yet. Create the public Supabase Storage bucket "${INSTITUTION_LOGO_BUCKET}" and retry.`
        );
      }
      throw new Error(
        error.message || 'The institution logo could not be uploaded. Check the storage bucket configuration.'
      );
    }
    const publicUrl = supabase.storage.from(INSTITUTION_LOGO_BUCKET).getPublicUrl(data.path).data.publicUrl;
    return publicUrl;
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
      let finalLogoUrl = (form.logoUrl || '').trim();
      if (selectedLogoFile) {
        setUploadingLogo(true);
        finalLogoUrl = await uploadInstitutionLogo(selectedLogoFile);
      }

      if (editingId) {
        await updateInstitution.mutateAsync({
          id: editingId,
          name: form.name,
          code: form.code,
          address: form.address,
          contactEmail: form.contactEmail,
          ...(finalLogoUrl ? { logoUrl: finalLogoUrl } : {}),
          ...(form.adminPassword ? { adminPassword: form.adminPassword } : {}),
        });
        toast.success(
          form.adminPassword ? 'Institution updated + admin password reset' : 'Institution updated'
        );
      } else {
        const res = await createInstitution.mutateAsync({
          ...form,
          ...(finalLogoUrl ? { logoUrl: finalLogoUrl } : {}),
        });
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
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogoSelection = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file for the institution logo.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo must be smaller than 5MB.');
      return;
    }
    setSelectedLogoFile(file);
    setForm((prev) => ({ ...prev, logoUrl: '' }));
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const handleEdit = (inst) => {
    setEditingId(inst.id);
    setCreatedCreds(null);
    setForm({
      name: inst.name || '',
      code: inst.code || '',
      address: inst.address || '',
      contactEmail: inst.contactEmail || '',
      logoUrl: inst.logoUrl || '',
      adminName: '',
      adminEmail: inst.adminEmail || '',
      adminPassword: '',
    });
    setSelectedLogoFile(null);
    setLogoPreview(inst.logoUrl || '');
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
    const count = inst.studentCount || 0;
    const enteredCode = window.prompt(
      `This is a permanent delete.\n\n` +
        `Type the Secret Code exactly to continue:\n${DELETE_SECRET_CODE}\n\n` +
        `Institution: ${inst.name}\n` +
        `Students that will be deleted: ${count}\n\n` +
        `WARNING: this deletes the institution and all students belonging to it permanently.`,
      ''
    );

    if (enteredCode === null) return;
    if (enteredCode.trim() !== DELETE_SECRET_CODE) {
      toast.error('Incorrect secret code. Deletion cancelled.');
      return;
    }

    try {
      const res = await deleteInstitution.mutateAsync({ id: inst.id, secretCode: DELETE_SECRET_CODE });
      toast.success(
        `Permanently deleted "${inst.name}" and ${res.deletedStudents || count} student(s).`,
        { autoClose: 8000 }
      );
    } catch (err) {
      toast.error(err.message || 'Delete failed');
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

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-fg-muted mb-1">College logo</label>
            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-edge bg-surface-2 p-3 md:flex-row md:items-center">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-edge bg-surface">
                {(logoPreview || form.logoUrl) ? (
                  <img
                    src={logoPreview || form.logoUrl}
                    alt="Institution preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-fg-subtle">No logo</span>
                )}
              </div>
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/jpg"
                  onChange={handleLogoSelection}
                  className="block w-full text-sm text-fg-muted file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-600"
                />
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="url"
                    value={form.logoUrl}
                    onChange={(e) => {
                      setSelectedLogoFile(null);
                      setLogoPreview('');
                      setForm({ ...form, logoUrl: e.target.value });
                    }}
                    placeholder="Or paste a public image URL"
                    className={`${inputCls} flex-1`}
                  />
                  {(uploadingLogo || selectedLogoFile) && (
                    <span className="text-xs text-fg-subtle">{uploadingLogo ? 'Uploading…' : 'Ready to save'}</span>
                  )}
                </div>
              </div>
            </div>
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
        ) : hasInstitutionError ? (
          <div className="p-6 text-sm text-red-700">
            <p className="font-semibold">Could not load institutions.</p>
            <p className="mt-1">
              {listError?.message || 'Check that you are signed in as a super-admin and try again.'}
            </p>
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
                  <th className="w-10 px-2 py-3" aria-label="Expand" />
                  <th className="text-left px-6 py-3 font-medium">Name</th>
                  <th className="text-left px-6 py-3 font-medium">Code</th>
                  <th className="text-left px-6 py-3 font-medium">Admin login ID</th>
                  <th className="text-left px-6 py-3 font-medium">Password</th>
                  <th className="text-left px-6 py-3 font-medium">Students</th>
                  <th className="text-right px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {institutions.map((inst) => {
                  const expanded = expandedId === inst.id;
                  const toggle = () => setExpandedId(expanded ? null : inst.id);
                  return (
                  <Fragment key={inst.id}>
                  <tr
                    className="hover:bg-surface-2 cursor-pointer"
                    onClick={toggle}
                  >
                    <td className="px-2 py-4 text-fg-subtle">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggle(); }}
                        aria-expanded={expanded}
                        aria-label={expanded ? `Hide students in ${inst.name}` : `Show students in ${inst.name}`}
                        className="p-1 rounded hover:bg-surface-3"
                      >
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {inst.logoUrl ? (
                          <img src={inst.logoUrl} alt={inst.name} className="h-10 w-10 rounded-lg object-cover border border-edge bg-surface" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-edge bg-surface text-[10px] font-bold uppercase text-fg-subtle">
                            {inst.name?.slice(0, 2) || 'IN'}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-fg">{inst.name}</div>
                          {inst.address && <div className="text-xs text-fg-subtle">{inst.address}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-fg-muted">{inst.code || '—'}</td>
                    <td className="px-6 py-4 text-fg-muted font-mono text-xs">
                      {inst.adminEmail || '—'}
                    </td>
                    <td className="px-6 py-4 text-fg font-mono text-xs break-all">
                      {inst.adminPassword || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        {inst.studentCount || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
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

                  {expanded && (
                    <tr className="bg-surface-2/40">
                      {/* colSpan covers every column: the toggle, the data columns and the actions column. */}
                      <td colSpan={7} className="p-0 border-t border-edge">
                        <InstitutionStudents
                          institution={inst}
                          onViewStudent={setViewingStudent}
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Clicking a student's name opens the existing detail view, so this
          screen can answer "how is the college doing" AND "tell me about Arun"
          without a second page for the second question. */}
      {viewingStudent && (
        <StudentViewDetails
          student={viewingStudent}
          onClose={() => setViewingStudent(null)}
        />
      )}
    </div>
  );
};

export default InstitutionManagement;
