// backend/utils/academic.js
//
// Year of Passing Out is the stored academic year on a student. Year of Study
// is only used to CONVERT existing rows (and spreadsheet cells that still say
// "2nd Year") into a calendar year.
//
// Formula (see 015_year_of_passing_out.sql):
//   Passing Out Year = Academic Year Start Year + (Course Duration - Current Year of Study)
// Academic year "2026-27" uses start year 2026, matching the worked examples
// (4-year 1st year -> 2029, 3-year 1st year -> 2028).

export const SECTION_NA = 'N/A';
export const SECTION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** Indian academic year typically runs June–May. September 2026 is 2026-27. */
export const academicYearStart = (date = new Date()) => {
  const y = date.getFullYear();
  return date.getMonth() >= 5 ? y : y - 1;
};

export const passingYearOptions = (date = new Date()) => {
  const start = academicYearStart(date) - 1;
  return Array.from({ length: 8 }, (_, i) => String(start + i));
};

export const isCalendarYear = (raw) => /^(19|20)\d{2}$/.test(String(raw ?? '').trim());

/**
 * Reduce a stored year-of-study to 1..4, or null when it is a calendar year
 * or otherwise unreadable. Mirrors src/lib/studentYear.js.
 */
export const studyYearDigit = (raw) => {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v || isCalendarYear(v)) return null;

  const digit = v.match(/[1-4]/);
  if (digit) return Number(digit[0]);

  const roman = { i: 1, ii: 2, iii: 3, iv: 4 };
  const word = { first: 1, second: 2, third: 3, fourth: 4 };
  const token = v.replace(/[^a-z]/g, '');
  return roman[token] || word[token] || null;
};

/**
 * Typical programme length from the department name. Engineering / B.Des are
 * four years; BCA / BSc / BA / BCom / BBA are three; PG is two. Unknown names
 * default to four (this portal is engineering-heavy) unless the student is
 * already in a year that forces a longer course.
 */
export const courseDurationForDepartment = (department, studyYear = null) => {
  const d = String(department || '').trim();
  const lower = d.toLowerCase();
  let duration = 4;

  if (/^(mca|m\.?\s*tech|m\.?\s*e|m\.?\s*sc)\b/i.test(d) || lower === 'mca' || lower === 'm.tech' || lower === 'm.e' || lower === 'm.sc') {
    duration = 2;
  } else if (
    /^bca\b/i.test(d) ||
    /bachelor of computer applications/i.test(d) ||
    /^bsc\b/i.test(d) ||
    /bachelor of science/i.test(d) ||
    /bachelor of arts/i.test(d) ||
    /bachelor of commerce/i.test(d) ||
    /^bba\b/i.test(d) ||
    /bachelor of business/i.test(d)
  ) {
    duration = 3;
  } else if (/bachelor of design/i.test(d) || /engineering/i.test(d)) {
    duration = 4;
  } else if (/^bachelor of/i.test(d)) {
    duration = 3;
  }

  if (studyYear && studyYear > duration) return studyYear;
  return duration;
};

export const passingOutFromStudyYear = (studyYear, department, date = new Date()) => {
  const y = Number(studyYear);
  if (!Number.isInteger(y) || y < 1) return null;
  const duration = courseDurationForDepartment(department, y);
  return academicYearStart(date) + (duration - y);
};

/**
 * Accept a picker year (2029), or convert a leftover year-of-study (1..4 /
 * "2nd Year") using the department's course duration. Returns a 4-digit string
 * or '' when nothing usable is there.
 */
export const coercePassingYear = (raw, department = '') => {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  if (isCalendarYear(v)) return v;
  const study = studyYearDigit(v);
  if (!study) return '';
  const passing = passingOutFromStudyYear(study, department);
  return passing ? String(passing) : '';
};

export const isValidPassingYear = (raw) => {
  if (!isCalendarYear(raw)) return false;
  const n = Number(raw);
  const start = academicYearStart();
  return n >= start - 2 && n <= start + 10;
};

export const normalizeSection = (raw, { allowNA = true } = {}) => {
  const v = String(raw ?? '').trim().toUpperCase();
  if (allowNA && (v === 'N/A' || v === 'NA')) return SECTION_NA;
  if (v.length === 1 && v >= 'A' && v <= 'Z') return v;
  return '';
};

export const isValidSection = (raw, { allowNA = false } = {}) =>
  Boolean(normalizeSection(raw, { allowNA }));

export default {
  academicYearStart,
  passingYearOptions,
  coercePassingYear,
  isValidPassingYear,
  normalizeSection,
  isValidSection,
  courseDurationForDepartment,
  SECTION_LETTERS,
  SECTION_NA,
};
