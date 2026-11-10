/* eslint-disable testing-library/no-unnecessary-act -- root.render is React's own createRoot, not a Testing Library call */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import OrderLinkStrip from './OrderLinkStrip';
import ProjectServiceWorkspace from './ProjectServiceWorkspace';
import { orderPagePath } from '../helpers/customerReturnNavigation';

global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const show = async (element) => act(async () => root.render(<MemoryRouter initialEntries={['/project-details/o1']}><Routes><Route path="/project-details/:id" element={element} /><Route path="*" element={<Where />} /></Routes></MemoryRouter>));
const find = (label) => [...container.querySelectorAll('button')].find(item => item.textContent.includes(label));

test('the order page address is decided in one place', () => {
  expect(orderPagePath('6af2f03e')).toBe('/order-detail/6af2f03e');
});

test('a working page names no price or invoice, only points to the order page', async () => {
  await show(<OrderLinkStrip orderId="o1" />);
  expect(container.textContent).toContain('Invoice, price and package details are on the order page.');
  expect(container.textContent).not.toContain('₹');
  expect(find('Payment due')).toBeUndefined();
  await act(async () => find('Go to order').click());
  expect(container.querySelector('[data-testid="where"]').textContent).toBe('/order-detail/o1');
});

test('when a bill is due, a second button goes to that bill, the one place it is paid', async () => {
  await show(<OrderLinkStrip orderId="o1" bill={{ _id: 'bill9' }} />);
  await act(async () => find('Payment due').click());
  expect(container.querySelector('[data-testid="where"]').textContent).toBe('/invoice-detail/bill9');
});

test('the project hub carries the strip and no longer the agreement card', async () => {
  const project = { _id: 'o1', projectProgress: 10, projectSnapshot: { displayName: 'Hub Project', salesAgreement: { finalPrice: 2099, regularPrice: 25000, package: { name: 'Pkg' } } }, linkedServices: [{ _id: 's1', productId: { serviceName: 'Care' }, servicePlanStatus: 'active' }] };
  await show(<ProjectServiceWorkspace project={project} onBack={() => {}} onAddService={() => {}} onOpenService={() => {}} onOpenProject={() => {}} />);
  expect(container.textContent).toContain('Go to order');
  expect(container.textContent).not.toContain('Agreed project total');
  expect(container.textContent).not.toContain('₹');
});
