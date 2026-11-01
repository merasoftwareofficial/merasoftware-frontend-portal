import { DEFAULT_SORT, nextSort, parseSort, sortRows, timeValue } from './adminListSort';

const columns = [
  { key: 'name', first: 'Asc', value: row => row.name || '' },
  { key: 'source', first: 'Asc', value: row => row.source || '' },
  { key: 'lastUpdated', first: 'Desc', value: row => timeValue(row.updatedAt) },
];
const rows = [
  { name: 'Lead 10', source: 'WhatsApp', updatedAt: '2026-10-01' },
  { name: 'lead 2', source: '', updatedAt: '2026-10-03' },
  { name: 'Lead 1', source: 'WhatsApp', updatedAt: '2026-10-02' },
];
const names = sorted => sorted.map(row => row.name);

test('an unknown URL value falls back to the default sort', () => {
  expect(parseSort('nonsenseAsc', columns)).toEqual(parseSort(DEFAULT_SORT, columns));
  expect(parseSort(null, columns)).toEqual({ key: 'lastUpdated', direction: 'Desc' });
});
test('first click uses the natural order, the next reverses it', () => {
  const current = parseSort(DEFAULT_SORT, columns);
  expect(nextSort(current, columns[0])).toBe('nameAsc');
  expect(nextSort({ key: 'name', direction: 'Asc' }, columns[0])).toBe('nameDesc');
  expect(nextSort(current, columns[2])).toBe('lastUpdatedAsc');
});
test('names ignore case and order numbers as numbers', () => {
  expect(names(sortRows(rows, { key: 'name', direction: 'Asc' }, columns))).toEqual(['Lead 1', 'lead 2', 'Lead 10']);
});
test('blanks stay last in both directions; latest modified leads within a group', () => {
  expect(names(sortRows(rows, { key: 'source', direction: 'Asc' }, columns))).toEqual(['Lead 1', 'Lead 10', 'lead 2']);
  expect(names(sortRows(rows, { key: 'source', direction: 'Desc' }, columns))).toEqual(['Lead 1', 'Lead 10', 'lead 2']);
});
test('sorting leaves the original list alone', () => {
  const before = names(rows);
  sortRows(rows, { key: 'name', direction: 'Desc' }, columns);
  expect(names(rows)).toEqual(before);
});
