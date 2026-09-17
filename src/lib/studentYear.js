// src/lib/studentYear.js
//
// Year of study: the options, and a matcher that copes with what is actually in
// the column.
//
// WHY A MATCHER AND NOT `===`. profiles.year is text, and registration writes
// "1".."4" — but rows that predate the fixed list arrived by spreadsheet import
// and hold things like "1st year", "II", "2024". A strict equality filter shows
// an empty board for those students and looks like the filter is broken rather
// than like the data is untidy.
//
// So this normalises both sides to a single digit and compares that. Unlike the
// department fix, the stored values are NOT rewritten: year changes every
// academic year anyway, so a migration would be stale within months, and the
// tolerant read costs nothing.

export const YEAR_OPTIONS = [
  { value: '1', label: '1st Year' },
  { value: '2', label: '2nd Year' },
  { value: '3', label: '3rd Year' },
  { value: '4', label: '4th Year' },
];

/**
 * Reduce a stored year to '1'..'4', or '' when it says nothing usable.
 * Handles "3", "3rd", "3rd Year", "Year 3", "III".
 */
export const normalizeYear = (raw) => {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return '';

  // A calendar year is NOT a year of study. Without this, "2024" matches the
  // /[1-4]/ below and quietly files that student under 2nd Year — a wrong
  // cohort that looks perfectly correct on screen. Better to treat it as
  // unreadable so they only ever appear under "All years".
  if (/^(19|20)\d{2}$/.test(v)) return '';

  // A bare digit 1-4 anywhere is the common case ("3", "3rd year", "year 3").
  const digit = v.match(/[1-4]/);
  if (digit) return digit[0];

  // Roman numerals turn up in older imports.
  const roman = { i: '1', ii: '2', iii: '3', iv: '4' };
  const word = { first: '1', second: '2', third: '3', fourth: '4' };
  const token = v.replace(/[^a-z]/g, '');
  return roman[token] || word[token] || '';
};

/**
 * Does this student's stored year match the selected filter?
 * `filter` is 'all' or '1'..'4'. An unparseable year matches only 'all', so a
 * student with a junk year never silently lands in the wrong cohort.
 */
export const matchesYear = (studentYear, filter) => {
  if (!filter || filter === 'all') return true;
  return normalizeYear(studentYear) === String(filter);
};

/** '3' -> '3rd Year'. Falls back to whatever is stored when it can't be read. */
export const yearLabel = (raw) => {
  const n = normalizeYear(raw);
  return YEAR_OPTIONS.find((y) => y.value === n)?.label || String(raw ?? '');
};

export default { YEAR_OPTIONS, normalizeYear, matchesYear, yearLabel };
