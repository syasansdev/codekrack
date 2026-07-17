import { useState } from 'react';
import { useAdminScope } from '../hooks/useAdminScope';
import { useStudents, useDeleteStudent } from '../hooks/queries/useStudents';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import StudentViewDetails from './StudentViewDetails';
import EditStudentModal from './EditStudentModal';

const AdminStudentsList = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteModal, setDeleteModal] = useState({ show: false, student: null });
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);

  const { institutionId } = useAdminScope();
  // Already sorted by name, and scoped by the server.
  const { data: students = [], isLoading: loading } = useStudents({ institutionId });
  const deleteStudent = useDeleteStudent();
  const deleting = deleteStudent.isPending;

  // DELETION IS NOW ONE OPERATION, and it actually works.
  //
  // The old version deleted the Firestore doc, then called
  // deleteStudentAccount() -> POST /api/admin/delete-student. That endpoint DOES
  // NOT EXIST (adminRoutes only ever had /users, /users/:userId and /stats), so
  // it 404'd every single time. The 404 was swallowed by an inner try/catch that
  // reported "Student deleted from database" plus a soft warning — meaning every
  // student ever "deleted" through this screen still had a working login, now
  // with no profile behind it.
  //
  // DELETE /api/students/:id removes the auth user; the profile and its
  // platform_stats cascade. Verified in the API tests: no orphan remains.
  const handleDeleteStudent = async () => {
    if (!deleteModal.student) return;
    try {
      await deleteStudent.mutateAsync(deleteModal.student.id);
      toast.success(`Student ${deleteModal.student.name} deleted — login removed too`);
    } catch (error) {
      toast.error('Failed to delete student: ' + error.message);
    } finally {
      setDeleteModal({ show: false, student: null });
    }
  };

  const filteredStudents = students.filter(student => 
    student.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.registerNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.department?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-fg-muted text-lg font-medium">Loading students...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-fg mb-3">Student Management</h1>
          <p className="text-lg text-fg-muted">Manage student accounts and data</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-surface p-6 rounded-2xl shadow-lg border border-edge text-center">
            <div className="text-3xl font-bold text-blue-600 mb-2">{students.length}</div>
            <div className="text-sm text-fg-muted font-medium">Total Students</div>
          </div>
          {/* "Active Accounts" and "Temp Passwords" used to live here, counted
              from requiresPasswordReset and tempPassword. Both fields are gone —
              no password is stored, and whether someone has actually signed in
              is auth.users.last_sign_in_at, reported on the Student Access
              screen. Counting a dropped field would just render 0 forever. */}
          <div className="bg-surface p-6 rounded-2xl shadow-lg border border-edge text-center">
            <div className="text-3xl font-bold text-green-600 mb-2">
              {students.filter((s) => s.invitedAt).length}
            </div>
            <div className="text-sm text-fg-muted font-medium">Invited</div>
          </div>
          <div className="bg-surface p-6 rounded-2xl shadow-lg border border-edge text-center">
            <div className="text-3xl font-bold text-purple-600 mb-2">
              {students.filter((s) => Object.keys(s.platformUrls || {}).length > 0).length}
            </div>
            <div className="text-sm text-fg-muted font-medium">With Platforms</div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-8">
          <div className="relative max-w-md mx-auto">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-fg-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search students..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-4 py-3 border border-edge-strong rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Students Table */}
        <div className="bg-surface rounded-2xl shadow-lg border border-edge overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-edge">
              <thead className="bg-surface-2">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-fg-subtle uppercase tracking-wider">Student</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-fg-subtle uppercase tracking-wider">Department</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-fg-subtle uppercase tracking-wider">Year</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-fg-subtle uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-fg-subtle uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-edge">
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-surface-2">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 font-bold text-sm">
                            {student.name?.charAt(0) || 'S'}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-fg">{student.name}</div>
                          <div className="text-sm text-fg-subtle">{student.email}</div>
                          {student.registerNumber && (
                            <div className="text-xs text-fg-subtle">Reg: {student.registerNumber}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-fg">{student.department || 'N/A'}</div>
                      <div className="text-sm text-fg-subtle">{student.college || ''}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-fg">
                        {student.year ? `Year ${student.year}` : 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {/* Was Active/Pending Setup off requiresPasswordReset — a flag
                          set at creation and never cleared, so it said "Pending"
                          forever regardless of what the student did. This reports
                          whether the invite has gone out; whether they've USED it
                          is on the Student Access screen, which joins the real
                          sign-in record. */}
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          student.invitedAt
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {student.invitedAt ? 'Invited' : 'No invite sent'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedStudent(student)}
                          className="text-blue-600 hover:text-blue-900 transition-colors p-1 rounded hover:bg-blue-50"
                          title="View Details"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setEditingStudent(student)}
                          className="text-green-600 hover:text-green-900 transition-colors p-1 rounded hover:bg-green-50"
                          title="Edit Student"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteModal({ show: true, student })}
                          className="text-red-600 hover:text-red-900 transition-colors p-1 rounded hover:bg-red-50"
                          title="Delete Student"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {filteredStudents.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">👥</div>
            <h3 className="text-2xl font-semibold text-fg-muted mb-2">No students found</h3>
            <p className="text-fg-subtle">
              {searchTerm ? 'Try adjusting your search terms.' : 'Students will appear here once added.'}
            </p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteModal.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
            onClick={() => !deleting && setDeleteModal({ show: false, student: null })}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="bg-surface rounded-2xl shadow-xl max-w-md w-full mx-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-fg">Delete Student</h3>
                    <p className="text-sm text-fg-subtle">This action cannot be undone</p>
                  </div>
                </div>

                <div className="bg-surface-2 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-bold text-sm">
                        {deleteModal.student?.name?.charAt(0) || 'S'}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium text-fg">{deleteModal.student?.name}</div>
                      <div className="text-sm text-fg-subtle">{deleteModal.student?.email}</div>
                    </div>
                  </div>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-5 h-5 text-red-600 mt-0.5">⚠️</div>
                    <div className="text-sm text-red-800">
                      <p className="font-semibold mb-1">Warning</p>
                      <p>This will permanently delete the student's account and all associated data. This action cannot be undone.</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteModal({ show: false, student: null })}
                    disabled={deleting}
                    className="flex-1 px-4 py-3 bg-surface-2 text-fg-muted rounded-xl hover:bg-surface-3 disabled:opacity-50 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteStudent}
                    disabled={deleting}
                    className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
                  >
                    {deleting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Deleting...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete Student
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Student Details Modal */}
      {selectedStudent && (
        <StudentViewDetails
          student={selectedStudent}
          onClose={() => setSelectedStudent(null)}
          // No local list-patching. The update mutation invalidates the students
          // query, so this list refetches on its own. Splicing the row in by hand
          // is exactly the manual state syncing React Query exists to remove —
          // and it's what would drift from the server's actual saved row.
          onStudentUpdate={() => {}}
          isAdminView={true}
        />
      )}

      {/* Edit Student Modal */}
      {editingStudent && (
        <EditStudentModal
          student={editingStudent}
          onClose={() => setEditingStudent(null)}
          onUpdate={() => setEditingStudent(null)}
        />
      )}
    </>
  );
};

export default AdminStudentsList;