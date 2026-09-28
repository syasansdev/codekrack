// src/components/TotalStudentsBreakdown.jsx
//
// What the "Total students" tile on the admin Overview opens when clicked: a
// breakdown of that same count by year and department, with an "All" option on
// each. It reuses useStudents() with the dashboard's own institutionId, so a
// super-admin sees the same scope the tile counted and an institution admin
// never sees past their own college.
//
// MOBILE: a bottom sheet, not a centered dialog. A dialog pinned to a fixed
// height fights the on-screen keyboard and the two filter dropdowns for space
// on a phone; a sheet anchored to the bottom with its own scroll region for the
// list does not.
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users } from 'lucide-react';
import { useStudents } from '../hooks/queries/useStudents';
import { YEAR_OPTIONS, matchesYear } from '../lib/studentYear';

const TotalStudentsBreakdown = ({ isOpen, onClose, institutionId }) => {
  const [year, setYear] = useState('all');
  const [department, setDepartment] = useState('all');

  const { data: students = [], isLoading } = useStudents({
    institutionId,
    enabled: isOpen,
  });

  // Built from who is actually enrolled, not the full ~380-entry canonical
  // list — a department nobody is in would only ever show a filter that
  // returns nothing.
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

  // By year, respecting whichever department is picked — this is what the
  // breakdown list below renders, so "All years" still shows the split.
  const byYear = useMemo(() => {
    const rows = YEAR_OPTIONS.map((y) => ({
      ...y,
      count: filtered.filter((s) => matchesYear(s.year, y.value)).length,
    }));
    const unclassified = filtered.filter((s) => !matchesYear(s.year, '1') && !matchesYear(s.year, '2') && !matchesYear(s.year, '3') && !matchesYear(s.year, '4')).length;
    return unclassified > 0 ? [...rows, { value: '', label: 'Unspecified', count: unclassified }] : rows;
  }, [filtered]);

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
                  Year
                </span>
                <select
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="w-full px-3 py-2.5 border border-edge-strong rounded-xl bg-surface text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Years</option>
                  {YEAR_OPTIONS.map((y) => (
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
            <div className="px-5 py-5 overflow-y-auto grow">
              {isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-3" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <p className="font-display text-4xl font-bold text-fg tabular-nums">
                      {filtered.length.toLocaleString()}
                    </p>
                    <p className="text-sm text-fg-subtle mt-1">
                      {year === 'all' && department === 'all'
                        ? 'students in total'
                        : 'students match this filter'}
                    </p>
                  </div>

                  {/* Only shown while "All years" is picked — once a specific
                      year is chosen the total above already answers the question,
                      and repeating one row under it is noise. */}
                  {year === 'all' && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle mb-2">
                        By year
                      </p>
                      {byYear.map((y) => (
                        <div
                          key={y.value || 'unspecified'}
                          className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3"
                        >
                          <span className="text-sm font-medium text-fg">{y.label}</span>
                          <span className="text-sm font-bold text-fg tabular-nums">{y.count}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {filtered.length === 0 && (
                    <p className="text-center text-sm text-fg-subtle py-6">
                      No students match this filter.
                    </p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TotalStudentsBreakdown;
