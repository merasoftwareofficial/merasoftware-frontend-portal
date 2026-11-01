import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

jest.mock('./AppContent', () => function Status() {
  const { isOnline, isInitialized } = require('./App').useOnlineStatus();
  return <p>{isInitialized ? (isOnline ? 'Online' : 'Offline') : 'Initializing'}</p>;
});
jest.mock('./components/EmailReviewDialog', () => () => null);
jest.mock('sonner', () => ({ Toaster: () => null }));
jest.mock('./context/DraftOrdersContext', () => ({ DraftOrdersProvider: ({ children }) => children }));
jest.mock('./context/UploadContext', () => ({ UploadProvider: ({ children }) => children }));

global.IS_REACT_ACT_ENVIRONMENT = true;

test('online status follows browser connectivity and removes listeners on unmount', async () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  const remove = jest.spyOn(window, 'removeEventListener');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<App />));
    expect(container.textContent).toBe('Online');
    await act(async () => window.dispatchEvent(new Event('offline')));
    expect(container.textContent).toBe('Offline');
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(container.textContent).toBe('Online');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
  expect(remove).toHaveBeenCalledWith('online', expect.any(Function));
  expect(remove).toHaveBeenCalledWith('offline', expect.any(Function));
  remove.mockRestore();
});
