// src/components/TotalStudentsBreakdown.jsx
//
// What the "Total students" tile on the admin Overview opens when clicked: the
// actual students behind that count, filterable by year and department (with an
// "All" option on each), each with the same "View" action Manage has. It reuses
// useStudents() with the dashboard's own institutionId, so a super-admin sees
// the same scope the tile counted and an institution admin never sees past
// their own college.
//
// MOBILE: a bottom sheet, not a centered dialog. A dialog pinned to a fixed
// height fights the on-screen keyboard and the two filter dropdowns for space
// on a phone; a sheet anchored to the bottom with its own scroll region for the
// list does not.
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users } from 'lucide-react';
import { useStudents } from '../hooks/queries/useStudents';
import { uniquePassingYears, matchesYear, yearLabel } from '../lib/studentYear';
import StudentViewDetails from './StudentViewDetails';

const TotalStudentsBreakdown = ({ isOpen, onClose, institutionId }) => {
  const [year, setYear] = useState('all');
  const [department, setDepartment] = useState('all');
  // Opens the SAME detail modal Manage uses, on top of this sheet — "View" here
  // is that action, not a smaller copy of it.
  const [viewingStudent, setViewingStudent] = useState(null);

  const { data: students = [], isLoading } = useStudents({
    institutionId,
    enabled: isOpen,
  });

  // Built from who is actually enrolled, not the full ~380-entry canonical
  // list — a department nobody is in would only ever show a filter that
  // returns nothing.
  const passingYears = useMemo(() => uniquePassingYears(students), [students]);
  const departments = useMemo(
    () => ['all', ...new Set(students.map((s) => s.department).filter(Boolean))].sort((a, b) =>
      a === 'all' ? -1 : b === 'all' ? 1 : a.localeCompare(b)
    ),
    [students]
  );

  const filtered = useMemo(
    () =>
      students.filter(
        (s) =>
          (year === 'all' || matchesYear(s.year, year)) &&
          (department === 'all' || s.department === department)
      ),
    [students, year, department]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%', opacity: 0, scale: 1 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="w-full sm:max-w-lg bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl
                       max-h-[85vh] sm:max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle, mobile only */}
            <div className="sm:hidden flex justify-center pt-3">
              <div className="h-1.5 w-10 rounded-full bg-surface-3" />
            </div>

            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-edge shrink-0">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-fg-subtle" />
                <h3 className="text-lg font-bold text-fg">Total Students</h3>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-surface-2 text-fg-subtle hover:text-fg transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Filters — stacked on mobile so neither select gets crushed */}
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0 border-b border-edge">
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wider text-fg-subtle mb-1.5">
                  Year of Passing Out
                </span>
                <select
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="w-full px-3 py-2.5 border border-edge-strong rounded-xl bg-surface text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Passing Out Years</option>
                  {passingYears.map((y) => (
                    <option key={y.value} value={y.value}>
                      {y.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wider text-fg-subtle mb-1.5">
                  Department
                </span>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-3 py-2.5 border border-edge-strong rounded-xl bg-surface text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d === 'all' ? 'All Departments' : d}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Result */}
            <div className="px-5 py-4 overflow-y-auto grow">
              {isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-3" />
                  ))}
                </div>
              ) : (
                <>
                  <p className="text-sm text-fg-subtle mb-3">
                    <span className="font-bold text-fg tabular-nums">{filtered.length.toLocaleString()}</span>{' '}
                    {year === 'all' && department === 'all' ? 'students in total' : 'students match this filter'}
                  </p>

                  {filtered.length === 0 ? (
                    <p className="text-center text-sm text-fg-subtle py-10">
                      No students match this filter.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {filtered.map((student) => (
                        <div
                          key={student.id}
                          className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5"
                        >
                          <div className="w-9 h-9 shrink-0 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-blue-600 font-bold text-xs">
                              {student.name?.charAt(0)?.toUpperCase() || 'S'}
                            </span>
                          </div>
                          <div className="min-w-0 grow">
                            <p className="text-sm font-medium text-fg truncate">
                              {student.name || student.email}
                            </p>
                            <p className="text-xs text-fg-subtle truncate">
                              {[student.department, yearLabel(student.year), student.section && student.section !== 'N/A' ? `Sec ${student.section}` : null].filter(Boolean).join(' · ') || student.email}
                            </p>
                          </div>
                          {/* Same action, same icon, as Manage's "View Details" —
                              this opens that identical modal, not a stand-in. */}
                          <button
                            onClick={() => setViewingStudent(student)}
                            className="shrink-0 text-blue-600 hover:text-blue-900 transition-colors p-2 rounded-lg hover:bg-blue-50"
                            title="View Details"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}

      {viewingStudent && (
        <StudentViewDetails
          student={viewingStudent}
          onClose={() => setViewingStudent(null)}
          isAdminView={true}
        />
      )}
    </AnimatePresence>
  );
};

export default TotalStudentsBreakdown;
