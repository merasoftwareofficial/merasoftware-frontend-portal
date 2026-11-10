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

const downloadLink = () => [...container.querySelectorAll('a')].find(item => /Download PDF/.test(item.textContent));
const viewLink = () => container.querySelector('a[aria-label="View invoice"]');
const shareButton = () => container.querySelector('button[aria-label="Share invoice"]');

test('a paid full-payment bill offers the final invoice PDF: a Download PDF button and a View icon button', async () => {
  await openDetail(url => (url.includes('invoiceId=') ? [bill()] : url.includes('orderId=') ? [bill(), statement()] : null));
  expect(downloadLink()).toBeTruthy();
  expect(downloadLink().getAttribute('href')).toMatch(/\/stmt\/download$/);
  expect(viewLink().getAttribute('href')).toMatch(/\/stmt\/view$/);
  expect(viewLink().getAttribute('title')).toBe('View');
});

const withSharing = async (canShare, run) => {
  const blob = new Blob(['%PDF'], { type: 'application/pdf' });
  global.fetch = jest.fn(async () => ({ ok: true, blob: async () => blob }));
  Object.assign(navigator, { share: jest.fn(async () => {}), canShare: jest.fn(() => canShare) });
  try { await run(); } finally { delete navigator.share; delete navigator.canShare; delete global.fetch; }
};
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

test('Share is prepared before it is tapped: the PDF is fetched on load and share runs straight from the tap', async () => {
  await withSharing(true, async () => {
    await openDetail(url => (url.includes('invoiceId=') ? [statement()] : null));
    await flush();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringMatching(/\/stmt\/download$/), expect.anything());
    expect(shareButton().disabled).toBe(false);
    await act(async () => shareButton().click());
    expect(navigator.share).toHaveBeenCalledTimes(1);
    expect(navigator.share.mock.calls[0][0].files[0].name).toMatch(/\.pdf$/);
  });
});

test('a device that cannot share a PDF, or has no file sharing, gets no Share button', async () => {
  await withSharing(false, async () => {
    await openDetail(url => (url.includes('invoiceId=') ? [statement()] : null));
    await flush();
    expect(shareButton()).toBeNull();
  });
  await act(async () => root.unmount());
  root = createRoot(container);
  global.fetch = jest.fn();
  try {
    await openDetail(url => (url.includes('invoiceId=') ? [statement()] : null));
    await flush();
    expect(shareButton()).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  } finally { delete global.fetch; }
});

test('an unpaid bill has no download, and a bill paid in parts is left as it was', async () => {
  await openDetail(url => (url.includes('invoiceId=') ? [bill({ status: 'unpaid', amountPaid: 0, paidDate: null })] : [bill(), statement()]));
  expect(downloadLink()).toBeUndefined();
  await act(async () => root.unmount());
  root = createRoot(container);
  await openDetail(url => (url.includes('invoiceId=') ? [bill({ installmentNumber: 1 })] : [bill({ installmentNumber: 1 }), statement()]));
  expect(downloadLink()).toBeUndefined();
});

test('the final invoice page itself is named Final invoice and reads Paid', async () => {
  await openDetail(url => (url.includes('invoiceId=') ? [statement()] : null));
  expect(container.textContent).toContain('Final invoice');
  expect(container.textContent).toContain('Paid');
  expect(container.textContent).not.toContain('Due Date');
  expect(container.textContent).toContain('Paid Date');
  expect(downloadLink()).toBeTruthy();
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

const planOrder = { _id: 'p1', projectSnapshot: undefined, servicePlanSnapshot: { serviceName: 'Website Update Plan' }, orderItems: [{ name: 'Website Update Plan' }] };
const planBill = (fields = {}) => ({ _id: 'pbill', orderId: planOrder, invoiceType: 'project', serviceCycleNumber: 1, status: 'paid', amount: 1152, amountPaid: 1152, invoiceDate: day, dueDate: day, paidDate: day, ...fields });
const planStatement = (fields = {}) => ({ _id: 'pstmt', orderId: planOrder, invoiceType: 'service_statement', status: 'paid', amount: 1152, amountPaid: 1152, invoiceDate: day, dueDate: day, paidDate: day, ...fields });

test('a plan paid in one go is one card on the order page and on the bills page: the Plan invoice, Paid', async () => {
  global.__responses = url => (url.includes('orderId=') ? [planBill(), planStatement()] : { ...detailOrder, _id: 'p1', productId: { category: 'service_plan', serviceName: 'Website Update Plan' } });
  await act(async () => root.render(<MemoryRouter initialEntries={['/order-detail/p1']}><Routes><Route path="/order-detail/:orderId" element={<OrderDetailPage />} /></Routes></MemoryRouter>));
  expect(container.textContent.match(/Plan invoice/g)).toHaveLength(1);
  expect(container.textContent).not.toContain('Total for this plan');
  expect(container.textContent).not.toContain('Summary');
  await act(async () => root.unmount());
  root = createRoot(container);
  global.__responses = () => [planBill(), planStatement()];
  await act(async () => root.render(<MemoryRouter><UserInvoices /></MemoryRouter>));
  expect(container.textContent.match(/Plan invoice/g)).toHaveLength(1);
  expect(container.textContent).toContain('Paid (1)');
});

test('a paid plan bill offers the plan statement PDF', async () => {
  await openDetail(url => (url.includes('invoiceId=') ? [planBill()] : [planBill(), planStatement()]));
  expect(downloadLink().getAttribute('href')).toMatch(/\/pstmt\/download$/);
});

const agreedOrder = { ...order, projectSnapshot: { displayName: 'All-in-One Startup', salesAgreement: { package: { name: 'All-in-One Startup' }, regularPrice: 25000, offerDiscount: 22901, finalPrice: 2099, scope: ['A single-page business website'], terms: ['Domain and hosting are separate'], extras: [] } } };
const packageButton = () => [...container.querySelectorAll('button')].find(item => /Package details/.test(item.textContent));

test('the invoice page no longer carries the agreement card', async () => {
  await openDetail(url => (url.includes('invoiceId=') ? [bill({ orderId: agreedOrder, status: 'unpaid', amountPaid: 0, paidDate: null })] : null));
  expect(container.textContent).not.toContain('Agreed project total');
  expect(container.textContent).not.toContain('Regular scope price');
  expect(packageButton()).toBeUndefined();
});

test('the order page holds the Package details button, for a project paid at once and for one paid in parts', async () => {
  global.__responses = url => (url.includes('orderId=') ? [bill({ orderId: agreedOrder }), statement({ orderId: agreedOrder })] : { ...detailOrder, ...agreedOrder, productId: detailOrder.productId });
  await act(async () => root.render(<MemoryRouter initialEntries={['/order-detail/o1']}><Routes><Route path="/order-detail/:orderId" element={<OrderDetailPage />} /></Routes></MemoryRouter>));
  expect(packageButton()).toBeTruthy();
  await act(async () => packageButton().click());
  expect(document.body.querySelector('[role="dialog"]').textContent).toContain('Agreed project total');
  await act(async () => document.body.querySelector('[role="dialog"] button[aria-label="Close"]').click());
  await act(async () => root.unmount());
  root = createRoot(container);
  const parts = { ...detailOrder, ...agreedOrder, productId: detailOrder.productId, isPartialPayment: true, installments: [{ installmentNumber: 1, amount: 1000, paid: true, paidDate: day }, { installmentNumber: 2, amount: 1099, paid: false, dueDate: day }] };
  global.__responses = url => (url.includes('orderId=') ? [bill({ orderId: agreedOrder, installmentNumber: 1 }), statement({ orderId: agreedOrder })] : parts);
  await act(async () => root.render(<MemoryRouter initialEntries={['/order-detail/o1']}><Routes><Route path="/order-detail/:orderId" element={<OrderDetailPage />} /></Routes></MemoryRouter>));
  expect(container.textContent).toContain('Payments');
  expect(packageButton()).toBeTruthy();
});
