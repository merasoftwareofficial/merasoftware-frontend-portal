import { collapseSingleBillOrders, receiptForBill, getInvoiceStatusText, getInvoicePurposeText, isProjectStatement } from './invoicePresentation';

const bill = (fields = {}) => ({ _id: 'bill', orderId: { _id: 'o1' }, invoiceType: 'project', status: 'paid', amount: 2099, installmentNumber: null, ...fields });
const statement = (fields = {}) => ({ _id: 'stmt', orderId: { _id: 'o1' }, invoiceType: 'project_final', status: 'paid', amount: 2099, ...fields });
const ids = list => list.map(item => item._id);

test('a project paid in full shows only its final invoice once the bill is paid', () => {
  expect(ids(collapseSingleBillOrders([bill(), statement()]))).toEqual(['stmt']);
});

test('while the bill is still to be paid, only the bill (with Pay now) is shown', () => {
  for (const status of ['unpaid', 'partially_paid', 'overdue']) {
    expect(ids(collapseSingleBillOrders([bill({ status }), statement({ status })]))).toEqual(['bill']);
  }
});

test('a project paid in parts is left alone, even while only its first installment bill exists', () => {
  const first = bill({ installmentNumber: 1, status: 'unpaid' });
  expect(ids(collapseSingleBillOrders([first, statement({ status: 'unpaid' })]))).toEqual(['bill', 'stmt']);
  const both = [bill({ _id: 'a', installmentNumber: 1 }), bill({ _id: 'b', installmentNumber: 2, status: 'unpaid' }), statement()];
  expect(ids(collapseSingleBillOrders(both))).toEqual(['a', 'b', 'stmt']);
});

test('an order with no final invoice yet, plans and complimentary invoices are untouched', () => {
  expect(ids(collapseSingleBillOrders([bill()]))).toEqual(['bill']);
  const plan = [{ _id: 'r', orderId: { _id: 'p1' }, invoiceType: 'plan_renewal', status: 'paid', amount: 1152 }, { _id: 's', orderId: { _id: 'p1' }, invoiceType: 'service_statement', status: 'paid', amount: 13824 }];
  expect(ids(collapseSingleBillOrders(plan))).toEqual(['r', 's']);
  const free = [{ _id: 'c', orderId: { _id: 'o1' }, invoiceType: 'complimentary_upgrade', status: 'paid' }];
  expect(ids(collapseSingleBillOrders([bill(), statement(), ...free]))).toEqual(['stmt', 'c']);
});

test('invoices of different orders are collapsed independently, and an order id may be a plain string', () => {
  const list = [bill(), statement(), bill({ _id: 'b2', orderId: 'o2', status: 'unpaid' }), statement({ _id: 's2', orderId: 'o2', status: 'unpaid' })];
  expect(ids(collapseSingleBillOrders(list))).toEqual(['stmt', 'b2']);
});

test('a cancelled bill does not count as a second bill; bad input gives an empty list', () => {
  expect(ids(collapseSingleBillOrders([bill({ _id: 'x', status: 'cancelled' }), bill(), statement()]))).toEqual(['x', 'stmt']);
  expect(collapseSingleBillOrders(undefined)).toEqual([]);
});

test('a paid project final invoice reads Paid and Final invoice; other statements keep their wording', () => {
  expect(getInvoiceStatusText(statement())).toEqual({ label: 'Paid', tone: 'success' });
  expect(getInvoiceStatusText(statement({ status: 'partially_paid' }))).toEqual({ label: 'Summary', tone: 'neutral' });
  expect(getInvoicePurposeText(statement(), 'All-in-One Startup')).toBe('Final invoice');
  const service = { invoiceType: 'service_statement', status: 'paid' };
  expect(getInvoiceStatusText(service)).toEqual({ label: 'Paid', tone: 'success' });
  expect(getInvoiceStatusText({ ...service, status: 'partially_paid' })).toEqual({ label: 'Summary', tone: 'neutral' });
  expect(getInvoicePurposeText(service, 'Update Plan')).toBe('Total for this plan');
  expect(isProjectStatement(service)).toBe(false);
});

const planBill = (fields = {}) => ({ _id: 'pbill', orderId: { _id: 'p1' }, invoiceType: 'project', serviceCycleNumber: 1, status: 'paid', amount: 1152, ...fields });
const planStatement = (fields = {}) => ({ _id: 'pstmt', orderId: { _id: 'p1' }, invoiceType: 'service_statement', status: 'paid', amount: 1152, ...fields });

test('a plan of one cycle is one card too: its statement once the bill is paid, the bill while it is due', () => {
  const paid = collapseSingleBillOrders([planBill(), planStatement()]);
  expect(ids(paid)).toEqual(['pstmt']);
  expect(paid[0].standsForBill).toBe(true);
  expect(getInvoicePurposeText(paid[0], 'Website Update Plan')).toBe('Plan invoice');
  expect(ids(collapseSingleBillOrders([planBill({ status: 'unpaid' }), planStatement({ status: 'unpaid' })]))).toEqual(['pbill']);
});

test('a plan of several cycles keeps its statement beside the cycle bill, worded as before', () => {
  const list = [planBill(), planStatement({ amount: 13824 })];
  const shown = collapseSingleBillOrders(list);
  expect(ids(shown)).toEqual(['pbill', 'pstmt']);
  expect(shown[1].standsForBill).toBeUndefined();
  expect(getInvoicePurposeText(shown[1], 'Website Update Plan')).toBe('Total for this plan');
  const renewals = [planBill({ _id: 'c1' }), planBill({ _id: 'c2', invoiceType: 'plan_renewal', serviceCycleNumber: 2 }), planStatement()];
  expect(ids(collapseSingleBillOrders(renewals))).toEqual(['c1', 'c2', 'pstmt']);
});

test('receiptForBill names the statement that stands in for a paid single bill, and nothing otherwise', () => {
  expect(receiptForBill([planBill(), planStatement()], planBill())._id).toBe('pstmt');
  expect(receiptForBill([bill(), statement()], bill())._id).toBe('stmt');
  expect(receiptForBill([planBill({ status: 'unpaid' }), planStatement({ status: 'unpaid' })], planBill({ status: 'unpaid' }))).toBeNull();
  expect(receiptForBill([bill({ installmentNumber: 1 }), statement()], bill({ installmentNumber: 1 }))).toBeNull();
  expect(receiptForBill([bill()], bill())).toBeNull();
});
