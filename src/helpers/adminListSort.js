// Clickable list headings. A sort is `<column key><Asc|Desc>` in the URL's `sort` value.
// Each column: { key, first: 'Asc' | 'Desc', value: row => string | number | null }.
export const DEFAULT_SORT = 'lastUpdatedDesc';

const SORT_VALUE = /^(.+)(Asc|Desc)$/;

export function parseSort(value, columns) {
  const [, key, direction] = SORT_VALUE.exec(value || '') || [];
  if (columns.some(column => column.key === key)) return { key, direction };
  return parseSort(DEFAULT_SORT, columns);
}

// The first click uses the column's natural order, the next click reverses it.
export function nextSort(current, column) {
  if (current.key !== column.key) return `${column.key}${column.first}`;
  return `${column.key}${current.direction === 'Asc' ? 'Desc' : 'Asc'}`;
}

const isBlank = value => value === null || value === undefined || value === '';
const compareValues = (left, right) => (typeof left === 'number' && typeof right === 'number'
  ? left - right
  : String(left).localeCompare(String(right), 'en', { sensitivity: 'base', numeric: true }));

export function sortRows(rows, { key, direction }, columns) {
  const byKey = name => columns.find(column => column.key === name);
  const chosen = byKey(key);
  const updated = byKey('lastUpdated');
  const name = byKey('name');
  const sign = direction === 'Asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = chosen.value(left);
    const b = chosen.value(right);
    // Rows with nothing to compare stay last in both directions.
    if (isBlank(a) !== isBlank(b)) return isBlank(a) ? 1 : -1;
    const main = isBlank(a) ? 0 : sign * compareValues(a, b);
    // Within one status or source: latest modified first, then by name.
    return main
      || compareValues(updated.value(right) || 0, updated.value(left) || 0)
      || compareValues(name.value(left) || '', name.value(right) || '');
  });
}

export const timeValue = value => {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
};
