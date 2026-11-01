import { useResource } from '../hooks/useResource';
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layers3 } from 'lucide-react';
import AdminWorkspaceShell, { AdminWorkspaceHeader } from '../components/admin/AdminWorkspaceShell';
import { PlansManager } from '../components/admin/AdminPlansManager';
import SummaryApi from '../common';

export default function AdminPlansPage() {
  const [search] = useSearchParams();
  const { data: catalogue, error, refresh } = useResource(SummaryApi.adminPlanCatalogue.url);

  return <>
    <AdminWorkspaceShell>
      <AdminWorkspaceHeader icon={Layers3} eyebrow="Services" title="Manage plans"
        subtitle="Set up plans, categories and availability. Existing client purchases keep their original terms." />
      <div className="p-5 sm:p-6">
        {error && <div role="alert" className="space-y-3 text-rose-800"><p>{error}</p><button className="rounded-xl border border-slate-300 px-4 py-2 text-slate-950" onClick={() => refresh()}>Try again</button></div>}
        {catalogue ? <PlansManager key={search.get('create') === '1' ? 'create' : 'list'} initial={catalogue} onReload={refresh} startCreating={search.get('create') === '1'} />
          : !error && <p role="status" className="text-slate-600">Loading plans and categories…</p>}
      </div>
    </AdminWorkspaceShell>
  </>;
}
