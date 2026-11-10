import { collapseFullPaymentBills, getInvoiceStatusText, getInvoicePurposeText, isProjectStatement } from './invoicePresentation';

const bill = (fields = {}) => ({ _id: 'bill', orderId: { _id: 'o1' }, invoiceType: 'project', status: 'paid', amount: 2099, installmentNumber: null, ...fields });
const statement = (fields = {}) => ({ _id: 'stmt', orderId: { _id: 'o1' }, invoiceType: 'project_final', status: 'paid', amount: 2099, ...fields });
const ids = list => list.map(item => item._id);

test('a project paid in full shows only its final invoice once the bill is paid', () => {
  expect(ids(collapseFullPaymentBills([bill(), statement()]))).toEqual(['stmt']);
});

test('while the bill is still to be paid, only the bill (with Pay now) is shown', () => {
  for (const status of ['unpaid', 'partially_paid', 'overdue']) {
    expect(ids(collapseFullPaymentBills([bill({ status }), statement({ status })]))).toEqual(['bill']);
  }
});

test('a project paid in parts is left alone, even while only its first installment bill exists', () => {
  const first = bill({ installmentNumber: 1, status: 'unpaid' });
  expect(ids(collapseFullPaymentBills([first, statement({ status: 'unpaid' })]))).toEqual(['bill', 'stmt']);
  const both = [bill({ _id: 'a', installmentNumber: 1 }), bill({ _id: 'b', installmentNumber: 2, status: 'unpaid' }), statement()];
  expect(ids(collapseFullPaymentBills(both))).toEqual(['a', 'b', 'stmt']);
});

test('an order with no final invoice yet, plans and complimentary invoices are untouched', () => {
  expect(ids(collapseFullPaymentBills([bill()]))).toEqual(['bill']);
  const plan = [{ _id: 'r', orderId: { _id: 'p1' }, invoiceType: 'plan_renewal', status: 'paid' }, { _id: 's', orderId: { _id: 'p1' }, invoiceType: 'service_statement', status: 'paid' }];
  expect(ids(collapseFullPaymentBills(plan))).toEqual(['r', 's']);
  const free = [{ _id: 'c', orderId: { _id: 'o1' }, invoiceType: 'complimentary_upgrade', status: 'paid' }];
  expect(ids(collapseFullPaymentBills([bill(), statement(), ...free]))).toEqual(['stmt', 'c']);
});

test('invoices of different orders are collapsed independently, and an order id may be a plain string', () => {
  const list = [bill(), statement(), bill({ _id: 'b2', orderId: 'o2', status: 'unpaid' }), statement({ _id: 's2', orderId: 'o2', status: 'unpaid' })];
  expect(ids(collapseFullPaymentBills(list))).toEqual(['stmt', 'b2']);
});

test('a cancelled bill does not count as a second bill; bad input gives an empty list', () => {
  expect(ids(collapseFullPaymentBills([bill({ _id: 'x', status: 'cancelled' }), bill(), statement()]))).toEqual(['x', 'stmt']);
  expect(collapseFullPaymentBills(undefined)).toEqual([]);
});

test('a paid project final invoice reads Paid and Final invoice; other statements keep their wording', () => {
  expect(getInvoiceStatusText(statement())).toEqual({ label: 'Paid', tone: 'success' });
  expect(getInvoiceStatusText(statement({ status: 'partially_paid' }))).toEqual({ label: 'Summary', tone: 'neutral' });
  expect(getInvoicePurposeText(statement(), 'All-in-One Startup')).toBe('Final invoice');
  const service = { invoiceType: 'service_statement', status: 'paid' };
  expect(getInvoiceStatusText(service)).toEqual({ label: 'Summary', tone: 'neutral' });
  expect(getInvoicePurposeText(service, 'Update Plan')).toBe('Total for this plan');
  expect(isProjectStatement(service)).toBe(false);
});
