/* eslint-disable testing-library/no-unnecessary-act -- root.render is React's own createRoot, not a Testing Library call */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import UserInvoices from './UserInvoices';
import InvoiceDetailPage from './InvoiceDetailPage';
import OrderDetailPage from './OrderDetailPage';

// The data each page reads is supplied here; nothing is fetched.
jest.mock('../hooks/useResource', () => {
  const React = require('react');
  return { useResource: (url, onData) => {
    React.useEffect(() => { const data = url && global.__responses ? global.__responses(url) : null; if (data) onData(data); }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
    return { loading: false, error: '', refresh() {}, data: undefined };
  } };
});

jest.mock('../components/DashboardLayout', () => ({ __esModule: true, default: ({ children }) => <div>{children}</div> }));

global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); delete global.__responses; });

const order = { _id: 'o1', projectSnapshot: { displayName: 'All-in-One Startup' }, orderItems: [] };
const day = '2026-11-10T00:00:00.000Z';
const bill = (fields = {}) => ({ _id: 'bill', orderId: order, invoiceType: 'project', status: 'paid', amount: 2099, amountPaid: 2099, installmentNumber: null, invoiceDate: day, dueDate: day, paidDate: day, ...fields });
const statement = (fields = {}) => ({ _id: 'stmt', orderId: order, invoiceType: 'project_final', status: 'paid', amount: 2099, amountPaid: 2099, invoiceDate: day, dueDate: day, paidDate: day, ...fields });

test('the bills page shows a project paid in full as one Final invoice, without a pay-by date', async () => {
  global.__responses = () => [bill(), statement()];
  await act(async () => root.render(<MemoryRouter><UserInvoices /></MemoryRouter>));
  const text = container.textContent;
  expect(text.match(/Final invoice/g)).toHaveLength(1);
  expect(text).not.toContain('All-in-One Startup plan');
  expect(text).not.toContain('Pay by');
  expect(text).toContain('Paid (1)');
});

test('while payment is still due the bills page shows only the bill, which holds Pay now', async () => {
  global.__responses = () => [bill({ status: 'unpaid', amountPaid: 0, paidDate: null }), statement({ status: 'unpaid', amountPaid: 0, paidDate: null })];
  await act(async () => root.render(<MemoryRouter><UserInvoices /></MemoryRouter>));
  const text = container.textContent;
  expect(text).toContain('All-in-One Startup plan');
  expect(text).not.toContain('Final invoice');
  expect(text).toContain('View bill');
});

const openDetail = async (responses) => {
  global.__responses = responses;
  await act(async () => root.render(<MemoryRouter initialEntries={['/invoice-detail/bill']}><Routes><Route path="/invoice-detail/:invoiceId" element={<InvoiceDetailPage />} /></Routes></MemoryRouter>));
};

test('a paid full-payment bill offers the final invoice PDF to view, download and share', async () => {
  await openDetail(url => (url.includes('invoiceId=') ? [bill()] : url.includes('orderId=') ? [bill(), statement()] : null));
  const link = [...container.querySelectorAll('a')].find(item => /Download Invoice/.test(item.textContent));
  expect(link).toBeTruthy();
  expect(link.getAttribute('href')).toMatch(/\/stmt\/download$/);
  expect([...container.querySelectorAll('a')].some(item => /View Invoice/.test(item.textContent))).toBe(true);
});

test('an unpaid bill has no download, and a bill paid in parts is left as it was', async () => {
  await openDetail(url => (url.includes('invoiceId=') ? [bill({ status: 'unpaid', amountPaid: 0, paidDate: null })] : [bill(), statement()]));
  expect(container.textContent).not.toContain('Download Invoice');
  await act(async () => root.unmount());
  root = createRoot(container);
  await openDetail(url => (url.includes('invoiceId=') ? [bill({ installmentNumber: 1 })] : [bill({ installmentNumber: 1 }), statement()]));
  expect(container.textContent).not.toContain('Download Invoice');
});

test('the final invoice page itself is named Final invoice and reads Paid', async () => {
  await openDetail(url => (url.includes('invoiceId=') ? [statement()] : null));
  expect(container.textContent).toContain('Final invoice');
  expect(container.textContent).toContain('Paid');
  expect([...container.querySelectorAll('a')].some(item => /Download Invoice/.test(item.textContent))).toBe(true);
});

const detailOrder = { ...order, productId: { category: 'standard_websites', serviceName: 'All-in-One Startup' }, isPartialPayment: false, createdAt: day, orderItems: [] };
const openOrder = async (invoices) => {
  global.__responses = url => (url.includes('myInvoices') || url.includes('orderId=') ? invoices : { ...detailOrder });
  await act(async () => root.render(<MemoryRouter initialEntries={['/order-detail/o1']}><Routes><Route path="/order-detail/:orderId" element={<OrderDetailPage />} /></Routes></MemoryRouter>));
};

test('the order page of a project paid in full lists one bill: the Final invoice, Paid, with its paid date', async () => {
  await openOrder([bill(), statement()]);
  const text = container.textContent;
  expect(text).toContain('Your bills');
  expect(text.match(/Final invoice/g)).toHaveLength(1);
  expect(text).not.toContain('All-in-One Startup plan');
  expect(text).not.toContain('Summary');
  expect(text).toContain('Paid on');
});

test('the order page of a project still to be paid lists only the bill', async () => {
  await openOrder([bill({ status: 'unpaid', amountPaid: 0, paidDate: null }), statement({ status: 'unpaid', amountPaid: 0, paidDate: null })]);
  const text = container.textContent;
  expect(text).toContain('All-in-One Startup plan');
  expect(text).not.toContain('Final invoice');
  expect(text).not.toContain('Summary');
});
