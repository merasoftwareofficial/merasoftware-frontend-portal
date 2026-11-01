import React, { Suspense, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'sonner';
import AdminLayout from './AdminLayout';
import SummaryApi from '../common';
import { useOnlineStatus } from '../App';
import { usePortalUpdates } from '../hooks/usePortalUpdates';
import { logout } from '../store/userSlice';
import CookieManager from '../utils/cookieManager';
import StorageService from '../utils/storageService';

const noUpdate = () => {};
const LIVE_DOMAINS = ['users'];

// Stays mounted across admin screens, so only the page area ever changes. It also
// holds the live connection open: a screen change must not close and reopen it.
export default function AdminShell({ preload }) {
  const user = useSelector(state => state?.user?.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isOnline } = useOnlineStatus();
  usePortalUpdates(noUpdate, LIVE_DOMAINS);

  useEffect(() => {
    const load = () => preload.forEach(page => page().catch(() => {}));
    if (!window.requestIdleCallback) {
      const timer = setTimeout(load, 500);
      return () => clearTimeout(timer);
    }
    const idle = window.requestIdleCallback(load);
    return () => window.cancelIdleCallback(idle);
  }, [preload]);

  const handleLogout = async () => {
    try {
      if (isOnline) {
        const response = await fetch(SummaryApi.logout_user.url, {
          method: SummaryApi.logout_user.method,
          credentials: 'include',
        });
        const data = await response.json();
        if (data.success) toast.success(data.message);
      }
      CookieManager.clearAll();
      StorageService.clearUserData();
      dispatch(logout());
      navigate('/');
    } catch (error) {
      console.error('Error during logout:', error);
      toast.error('Logout failed. Please try again.');
    }
  };

  return (
    <AdminLayout user={user} onLogout={handleLogout}>
      <Suspense fallback={<div role="status" aria-live="polite" className="p-6 text-center">Loading screen…</div>}>
        <Outlet />
      </Suspense>
    </AdminLayout>
  );
}
