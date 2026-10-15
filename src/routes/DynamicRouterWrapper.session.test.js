import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import reducer, { setUserDetails, logout } from '../store/userSlice';
import DynamicRouterWrapper from './DynamicRouterWrapper';
import { createRoleBasedRouter } from './index';

global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('./index', () => ({ createRoleBasedRouter: jest.fn(() => ({ id: 'stable-router' })) }));
jest.mock('react-router-dom', () => ({ RouterProvider: () => <div>Portal router</div> }));

test('login, role changes and logout keep the same router instead of remounting the app', async () => {
  const store = configureStore({ reducer: { user: reducer } });
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Provider store={store}><DynamicRouterWrapper /></Provider>));
    await act(async () => store.dispatch(setUserDetails({ _id: 'one', role: 'customer' })));
    await act(async () => store.dispatch(setUserDetails({ _id: 'one', role: 'admin' })));
    await act(async () => store.dispatch(logout()));
    expect(createRoleBasedRouter).toHaveBeenCalledTimes(1);
  } finally { await act(async () => root.unmount()); }
});
