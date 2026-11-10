/* eslint-disable testing-library/no-unnecessary-act -- root.render is React's own createRoot, not a Testing Library call */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PackageDetails from './PackageDetails';

global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

const order = {
  paymentPolicy: { mode: 'limited_uploads', offerTitle: 'Digital Dhamaka Offer', uploadAllowance: 2, dueDays: 7 },
  projectSnapshot: { salesAgreement: {
    package: { name: 'All-in-One Startup' }, regularPrice: 25000, offerDiscount: 22901, offer: { title: 'Digital Dhamaka Offer' }, finalPrice: 2099,
    scope: ['A single-page business website'], terms: ['Domain and hosting are separate'], extras: [],
  } },
};
const button = () => [...container.querySelectorAll('button')].find(item => /Package details/.test(item.textContent));

test('nothing is written on the page; one button opens the price, included lines, terms and payment terms', async () => {
  await act(async () => root.render(<PackageDetails order={order} />));
  expect(button()).toBeTruthy();
  expect(document.body.textContent).not.toContain('Agreed project total');
  expect(document.body.textContent).not.toContain('A single-page business website');
  await act(async () => button().click());
  const dialog = document.body.querySelector('[role="dialog"]');
  const text = dialog.textContent;
  for (const part of ['All-in-One Startup', '₹25,000', '₹22,901', 'Agreed project total', '₹2,099', 'A single-page business website', 'Domain and hosting are separate', 'Payment due 7 day(s)', 'Limited uploads before payment']) expect(text).toContain(part);
  await act(async () => dialog.querySelector('button[aria-label="Close"]').click());
  expect(document.body.querySelector('[role="dialog"]')).toBeNull();
});

test('a plan with only payment terms, and an old order with only an offer, still get the button', async () => {
  await act(async () => root.render(<PackageDetails order={{ paymentPolicy: order.paymentPolicy, servicePlanSnapshot: { serviceName: 'Website Update Plan' } }} />));
  await act(async () => button().click());
  expect(document.body.querySelector('[role="dialog"]').textContent).toContain('Payment due 7 day(s)');
  await act(async () => document.body.querySelector('[role="dialog"] button[aria-label="Close"]').click());
  await act(async () => root.render(<PackageDetails order={{ projectSnapshot: { offer: { title: 'Old Offer' } } }} />));
  await act(async () => button().click());
  expect(document.body.querySelector('[role="dialog"]').textContent).toContain('Offer: Old Offer');
});

test('an order with nothing agreed has no button', async () => {
  await act(async () => root.render(<PackageDetails order={{ projectSnapshot: {} }} />));
  expect(button()).toBeUndefined();
});
