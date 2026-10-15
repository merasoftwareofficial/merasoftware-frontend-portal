import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import reducer, { logout } from './store/userSlice';
import AppContent from './AppContent';
import ProtectedRoute from './components/ProtectedRoute';
import RoleBasedHome from './components/RoleBasedHome';
import Context from './context';
import postLogin from './helpers/postLogin';

global.IS_REACT_ACT_ENVIRONMENT = true;
const { MemoryRouter, Routes, Route, useNavigate } = require('react-router-dom');
let mockOnlineStatus;
jest.mock('./App', () => ({ useOnlineStatus: () => mockOnlineStatus }));
jest.mock('./common', () => ({ current_user: { url: '/api/user-details', method: 'get' },
  logout_user: { url: '/api/userLogout', method: 'get' } }));
jest.mock('./utils/cookieManager', () => ({ setUserDetails: jest.fn(), clearAll: jest.fn() }));
jest.mock('./helpers/scrollTop', () => () => null);
jest.mock('./utils/orderSummaryClient', () => ({ clearOrderSummary: jest.fn(), getOrderSummary: jest.fn(async () => []) }));

let container;
let root;
let store;
let resolveRequest;
const user = { _id: 'current-customer', name: 'Current', role: 'customer', walletBalance: 17 };
function LoginFixture() {
  const { fetchUserDetails } = React.useContext(Context);
  const navigate = useNavigate();
  return <><p>Login screen</p><button onClick={() => postLogin({
    dataApi: { success: true, message: 'Signed in', data: { user } },
    dispatch: store.dispatch, navigate, toast: { success: () => {} }, fetchUserDetails,
  })}>Sign in</button></>;
}
function render(path = '/dashboard') {
  root.render(<Provider store={store}><MemoryRouter initialEntries={[path]}>
    <Routes><Route element={<AppContent />}>
      <Route path="/" element={<RoleBasedHome />} />
      <Route path="/dashboard" element={<ProtectedRoute requireRole={['customer']}><p>Customer dashboard</p></ProtectedRoute>} />
      <Route path="/admin-panel/dashboard" element={<ProtectedRoute requireRole={['admin']}><p>Admin dashboard</p></ProtectedRoute>} />
      <Route path="/login" element={<LoginFixture />} />
      <Route path="/unauthorized" element={<p>Unauthorized Access</p>} />
    </Route></Routes>
  </MemoryRouter></Provider>);
}
const success = () => ({ status: 200, ok: true, json: async () => ({ success: true, data: user }) });
beforeEach(() => {
  localStorage.clear();
  mockOnlineStatus = { isInitialized: true, isOnline: true };
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  global.fetch = jest.fn(() => new Promise(resolve => { resolveRequest = resolve; }));
  store = configureStore({ reducer: { user: reducer } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

test('stale admin cache cannot send a new customer to Unauthorized while verification is pending', async () => {
  localStorage.setItem('userDetails', JSON.stringify({ _id: 'old-admin', role: 'admin' }));
  await act(async () => render());
  expect(container.textContent).toContain('Checking your session');
  expect(container.textContent).not.toContain('Unauthorized');
  expect(store.getState().user.initialized).toBe(false);
  expect(store.getState().user.user).toBeNull();
  await act(async () => resolveRequest(success()));
  expect(container.textContent).toContain('Customer dashboard');
  expect(JSON.parse(localStorage.getItem('userDetails'))._id).toBe(user._id);
  expect(store.getState().user.walletBalance).toBe(17);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('temporary server failure stays on requested URL and Retry opens the dashboard', async () => {
  await act(async () => render());
  await act(async () => resolveRequest({ status: 503, ok: false }));
  expect(container.textContent).toContain('Could not verify your session');
  expect(container.textContent).not.toContain('Login screen');
  expect(store.getState().user.initialized).toBe(false);
  fetch.mockResolvedValueOnce(success());
  await act(async () => container.querySelector('button').click());
  expect(container.textContent).toContain('Customer dashboard');
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('401 clears stale cache and redirects to login', async () => {
  localStorage.setItem('userDetails', JSON.stringify({ _id: 'old', role: 'customer' }));
  await act(async () => render());
  await act(async () => resolveRequest({ status: 401, ok: false }));
  expect(container.textContent).toContain('Login screen');
  expect(localStorage.getItem('userDetails')).toBeNull();
  expect(store.getState().user.user).toBeNull();
});

test('a verified customer still cannot access admin routes', async () => {
  await act(async () => render('/admin-panel/dashboard'));
  await act(async () => resolveRequest(success()));
  expect(container.textContent).toContain('Unauthorized Access');
});

test('offline entry waits and reconnect makes exactly one session request', async () => {
  mockOnlineStatus.isOnline = false;
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  await act(async () => render());
  expect(container.textContent).toContain('You are offline');
  expect(fetch).not.toHaveBeenCalled();
  mockOnlineStatus = { isInitialized: true, isOnline: true };
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  await act(async () => render());
  await act(async () => resolveRequest(success()));
  expect(container.textContent).toContain('Customer dashboard');
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('root entry waits for server identity then opens its portal home', async () => {
  await act(async () => render('/'));
  expect(container.textContent).toContain('Checking your session');
  await act(async () => resolveRequest(success()));
  expect(container.textContent).toContain('Customer dashboard');
});

test('public login remains usable while the session service is down', async () => {
  await act(async () => render('/login'));
  await act(async () => resolveRequest({ status: 503, ok: false }));
  expect(container.textContent).toContain('Login screen');
});

test('logout from an existing portal screen invalidates an in-flight successful check', async () => {
  await act(async () => render());
  await act(async () => store.dispatch(logout()));
  await act(async () => resolveRequest(success()));
  expect(container.textContent).toContain('Login screen');
  expect(store.getState().user.user).toBeNull();
  expect(localStorage.getItem('userDetails')).toBeNull();
});

test('portal login supersedes a startup 401 and keeps the newly signed-in user', async () => {
  await act(async () => render('/login'));
  const oldResponse = resolveRequest;
  fetch.mockResolvedValueOnce(success());
  await act(async () => container.querySelector('button').click());
  await act(async () => oldResponse({ status: 401, ok: false }));
  expect(container.textContent).toContain('Customer dashboard');
  expect(store.getState().user.user._id).toBe(user._id);
  expect(fetch).toHaveBeenCalledTimes(2);
});
