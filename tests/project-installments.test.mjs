// Installment names come from the installment itself (merasoftware/src/docs/package.md §5 item 17).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInstallmentPreview, installmentName, installmentPurpose } from '../src/helpers/projectInstallments.js';

test('a 50 / 50 project is named 50%, not the old fixed 30 / 30 / 40', () => {
  const [first, second] = buildInstallmentPreview(10000, 2).map((row, index) => ({ ...row, progressThreshold: index ? 90 : null }));
  assert.equal(installmentName(second, 2), 'Installment 2 of 2 (50%)');
  assert.equal(installmentPurpose(first, 2), 'This payment starts your project.');
  assert.equal(installmentPurpose(second, 2), 'This payment completes the payment for your project.');
});

test('a 30 / 30 / 40 project names each part and its progress step', () => {
  const rows = buildInstallmentPreview(10000, 3).map((row, index) => ({ ...row, progressThreshold: [null, 50, 90][index] }));
  assert.deepEqual(rows.map(row => installmentName(row, 3)), ['Installment 1 of 3 (30%)', 'Installment 2 of 3 (30%)', 'Installment 3 of 3 (40%)']);
  assert.equal(installmentPurpose(rows[1], 3), 'This payment lets your project continue past 50%.');
  assert.equal(installmentName({ installmentNumber: 2 }), 'Installment 2', 'without a count or percentage');
});

test('monthly cycles match the backend builder exactly and are named by their date', async () => {
  const { createRequire } = await import('node:module');
  const backend = createRequire(import.meta.url)('../../backend/helpers/projectInstallments.js');
  const { buildCycleInstallmentPreview } = await import('../src/helpers/projectInstallments.js');
  const start = new Date('2026-11-08T10:00:00Z');
  for (const [price, cycles, months] of [[800, 3, 1], [2700, 4, 3], [999, 7, 1], [5000, 1, 12]]) {
    const pick = rows => rows.map(({ installmentNumber, percentage, amount, dueBy, dueDate }) => ({ installmentNumber, percentage, amount, dueBy, dueDate: dueDate.toISOString() }));
    assert.deepEqual(pick(buildCycleInstallmentPreview(price, cycles, months, start)), pick(backend.buildCycleInstallments(price, cycles, months, start)));
  }
  const [first, second] = buildCycleInstallmentPreview(2700, 4, 3, start);
  assert.equal(installmentName(second, 4), 'Cycle 2 of 4 · due 8 Feb 2027');
  assert.equal(installmentPurpose(first, 4), 'This payment starts your package.');
  assert.equal(installmentPurpose(second, 4), 'This payment keeps your package running for its next billing cycle.');
});
