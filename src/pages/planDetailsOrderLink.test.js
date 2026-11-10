/* eslint-disable testing-library/no-unnecessary-act -- root.render is React's own createRoot, not a Testing Library call */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PlanDetails from './PlanDetails';

jest.mock('react-redux', () => ({ useSelector: () => ({ _id: 'u1', name: 'Customer' }), useDispatch: () => jest.fn() }));
jest.mock('../components/DashboardLayout', () => ({ __esModule: true, default: ({ children }) => <div>{children}</div> }));
jest.mock('../hooks/useResource', () => {
  const React = require('react');
  return { useResource: (url, onData) => {
    React.useEffect(() => { const data = url && global.__responses ? global.__responses(url) : null; if (data) onData(data); }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
    return { loading: false, error: '', refresh: async () => {}, data: undefined };
  } };
});

global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); delete global.__responses; });

const day = '2026-10-30T00:00:00.000Z';
const plan = (invoices) => ({
  _id: 'p1', isServicePlan: true, serviceCyclePrice: 1152, serviceTotalCycles: 1, createdAt: day, servicePlanStatus: 'active', orderVisibility: 'approved',
  productId: { serviceName: 'Website Update Plan', category: 'service_plan' }, servicePlanSnapshot: { serviceName: 'Website Update Plan', capability: 'upload_data' },
  orderItems: [{ name: 'Website Update Plan' }], serviceInvoices: invoices,
  paymentPolicy: { mode: 'advance', offerTitle: 'Plan Offer', dueDays: 7 },
});
const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const open = async (data) => {
  global.__responses = url => (url.includes('/uploads') ? [] : data);
  await act(async () => root.render(<MemoryRouter initialEntries={['/plan-details/p1']}><Routes><Route path="/plan-details/:orderId" element={<PlanDetails />} /><Route path="*" element={<Where />} /></Routes></MemoryRouter>));
};
const find = (label) => [...container.querySelectorAll('button')].find(item => item.textContent.includes(label));

test('a plan page names no price and no payment-terms box, and points to the order page', async () => {
  await open(plan([{ _id: 'b1', invoiceType: 'project', status: 'paid', amount: 1152, amountPaid: 1152 }, { _id: 's1', invoiceType: 'service_statement', status: 'paid', amount: 1152, amountPaid: 1152 }]));
  const text = container.textContent;
  expect(text).toContain('Invoice, price and package details are on the order page.');
  expect(text).not.toContain('₹1,152');
  expect(text).not.toContain('Price');
  expect(text).not.toContain('Agreed payment terms');
  expect(find('Payment details')).toBeUndefined();
  expect(find('Payment due')).toBeUndefined();
  await act(async () => find('Go to order').click());
  expect(container.querySelector('[data-testid="where"]').textContent).toBe('/order-detail/p1');
});

test('a plan with a bill due keeps the way to pay it: Payment due goes to the oldest unpaid bill', async () => {
  await open(plan([
    { _id: 'new', invoiceType: 'plan_renewal', status: 'unpaid', amount: 1152, amountPaid: 0, serviceCycleNumber: 3 },
    { _id: 'old', invoiceType: 'plan_renewal', status: 'overdue', amount: 1152, amountPaid: 0, serviceCycleNumber: 2 },
    { _id: 's1', invoiceType: 'service_statement', status: 'partially_paid', amount: 3456, amountPaid: 0 },
  ]));
  await act(async () => find('Payment due').click());
  expect(container.querySelector('[data-testid="where"]').textContent).toBe('/invoice-detail/old');
});
