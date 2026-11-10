/* eslint-disable testing-library/no-unnecessary-act -- root.render is React's own createRoot, not a Testing Library call */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ProjectAgreement from './ProjectAgreement';

global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

const order = { projectSnapshot: { salesAgreement: {
  package: { name: 'Saved Starter' }, regularPrice: 10000, offerDiscount: 9301, offer: { title: 'Saved Offer' }, finalPrice: 699,
  scope: ['A single-page business website'], terms: ['Domain and hosting are separate'], extras: [],
} } };

test('the page shows the price, not the included lines or terms; a button opens them in a popup', async () => {
  await act(async () => root.render(<ProjectAgreement order={order} />));
  expect(container.textContent).toContain('Saved Starter');
  expect(container.textContent).toContain('Agreed project total');
  expect(document.body.textContent).not.toContain('A single-page business website');
  expect(document.body.textContent).not.toContain('Domain and hosting are separate');
  const button = [...container.querySelectorAll('button')].find(item => /View package benefits/.test(item.textContent));
  expect(button).toBeTruthy();
  await act(async () => button.click());
  const dialog = document.body.querySelector('[role="dialog"]');
  expect(dialog.textContent).toContain('A single-page business website');
  expect(dialog.textContent).toContain('Domain and hosting are separate');
  await act(async () => dialog.querySelector('button[aria-label="Close"]').click());
  expect(document.body.querySelector('[role="dialog"]')).toBeNull();
});

test('a project with nothing saved to show has no button', async () => {
  const bare = { projectSnapshot: { salesAgreement: { ...order.projectSnapshot.salesAgreement, scope: [], terms: [] } } };
  await act(async () => root.render(<ProjectAgreement order={bare} />));
  expect([...container.querySelectorAll('button')].some(item => /View package benefits/.test(item.textContent))).toBe(false);
});
