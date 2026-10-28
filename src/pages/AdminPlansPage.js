import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layers3 } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import AdminWorkspaceShell, { AdminWorkspaceHeader } from '../components/admin/AdminWorkspaceShell';
import { PlansManager } from '../components/admin/AdminPlansManager';
import { readAdminPlanCatalogue } from '../helpers/adminPlanApi';
import SummaryApi from '../common';
import CookieManager from '../utils/cookieManager';
import StorageService from '../utils/storageService';
import { logout } from '../store/userSlice';

export default function AdminPlansPage() {
  const user = useSelector(state => state?.user?.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [catalogue, setCatalogue] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError('');
    readAdminPlanCatalogue().then(data => {
      if (!cancelled) setCatalogue(data);
    }).catch(cause => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; };
  }, [retry]);

  async function handleLogout() {
    try { await fetch(SummaryApi.logout_user.url, { method: SummaryApi.logout_user.method, credentials: 'include' }); }
    finally {
      CookieManager.clearAll(); StorageService.clearUserData(); dispatch(logout()); navigate('/');
    }
  }
  return <AdminLayout user={user} onLogout={handleLogout}>
    <AdminWorkspaceShell>
      <AdminWorkspaceHeader icon={Layers3} eyebrow="Services" title="Manage plans"
        subtitle="Set up plans, categories and availability. Existing client purchases keep their original terms." />
      <div className="p-5 sm:p-6">
        {error ? <div role="alert" className="space-y-3 text-rose-800"><p>{error}</p><button className="rounded-xl border border-slate-300 px-4 py-2 text-slate-950" onClick={() => setRetry(value => value + 1)}>Try again</button></div>
          : catalogue ? <PlansManager key={search.get('create') === '1' ? 'create' : 'list'} initial={catalogue} startCreating={search.get('create') === '1'} />
            : <p role="status" className="text-slate-600">Loading plans and categories…</p>}
      </div>
    </AdminWorkspaceShell>
  </AdminLayout>;
}
