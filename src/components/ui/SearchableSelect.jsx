// src/components/ui/SearchableSelect.jsx
//
// A type-to-filter picker over a fixed list.
//
// WHY THIS EXISTS. Two fields now choose from lists too long for a native
// <select>: colleges (grows with every onboarded institution) and departments
// (380 entries). A native select with 380 options is a wall of text on desktop
// and an unusable spinning drum on a phone — it is the step people abandon.
//
// WHAT IT IS NOT: a combobox that accepts free text. Typing only FILTERS. The
// value handed back is always one the caller supplied, which is the whole point
// — free text is what fragmented departments into nineteen spellings of eight
// courses in the first place.
import { useMemo, useRef, useState } from 'react';

/**
 * @param {string}   value        currently selected item ('' when none)
 * @param {function} onChange     called with the chosen item, or '' when cleared
 * @param {string[]} [options]    flat list
 * @param {{label:string, items:string[]}[]} [groups]  grouped list; takes
 *        precedence over `options`. Groups are display-only — the value is
 *        always the plain item string.
 */
const SearchableSelect = ({
  value,
  onChange,
  options,
  groups,
  placeholder = 'Search…',
  disabled = false,
  invalid = false,
  id,
  emptyMessage = 'Nothing matches that search.',
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef(null);

  const allGroups = useMemo(
    () => (groups?.length ? groups : [{ label: null, items: options || [] }]),
    [groups, options]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allGroups;
    return allGroups
      .map((g) => ({ ...g, items: g.items.filter((i) => i.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length);
  }, [allGroups, query]);

  const matchCount = filtered.reduce((n, g) => n + g.items.length, 0);

  const choose = (item) => {
    onChange(item);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        // Showing the SELECTED value when closed and the QUERY when open is what
        // makes this read as a picker rather than a text box: the field always
        // displays the committed choice unless you are actively searching.
        value={open ? query : value || ''}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // Typing after choosing clears the choice, so what is submitted always
          // matches what the box shows.
          if (value) onChange('');
        }}
        // A blur fires before the click on an option would register, so closing
        // has to wait long enough for the click to land.
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          // One match + Enter is the fast path: type three letters, press Enter.
          if (e.key === 'Enter' && open && matchCount === 1) {
            e.preventDefault();
            choose(filtered[0].items[0]);
          }
        }}
        className={`w-full px-3 py-2 pr-10 border rounded-lg outline-none transition bg-surface text-fg
          focus:ring-2 focus:ring-orange-500 focus:border-orange-500
          ${invalid ? 'border-red-400' : 'border-edge-strong'}
          ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      />

      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
        <svg className="h-5 w-5 text-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {open && !disabled && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-edge-strong bg-surface shadow-lg">
          {matchCount === 0 ? (
            <li className="px-3 py-2.5 text-sm text-fg-subtle">{emptyMessage}</li>
          ) : (
            filtered.map((g) => (
              <li key={g.label || '_'}>
                {g.label && (
                  <div className="sticky top-0 bg-surface-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                    {g.label}
                  </div>
                )}
                <ul>
                  {g.items.map((item) => (
                    <li key={item}>
                      <button
                        type="button"
                        // mousedown default would blur the input and close the
                        // list before this button's click ever fires.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => choose(item)}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-black/5 ${
                          item === value ? 'font-semibold text-orange-600' : 'text-fg'
                        }`}
                      >
                        {item}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};

export default SearchableSelect;
